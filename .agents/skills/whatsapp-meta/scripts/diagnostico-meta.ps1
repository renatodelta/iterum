<#
.SYNOPSIS
  Diagnostico da integracao WhatsApp (Meta Cloud API) do Iterum.

.DESCRIPTION
  - Valida o token e mostra dados do numero (Phone Number ID).
  - Lista os apps inscritos na WABA (necessario para receber mensagens reais).
  - Opcionalmente inscreve o app na WABA (-SubscribeApp).
  - Opcionalmente testa a verificacao do webhook (-WebhookUrl).

  O token NUNCA e impresso. Ele e lido de $env:META_ACCESS_TOKEN ou pedido de forma oculta.

.EXAMPLE
  .\diagnostico-meta.ps1 -WabaId 123 -PhoneNumberId 456
  .\diagnostico-meta.ps1 -WabaId 123 -PhoneNumberId 456 -SubscribeApp
  .\diagnostico-meta.ps1 -WabaId 123 -PhoneNumberId 456 -WebhookUrl https://meu-app.vercel.app/api/webhooks/whatsapp
#>
param(
  [Parameter(Mandatory = $true)][string]$WabaId,
  [Parameter(Mandatory = $true)][string]$PhoneNumberId,
  [string]$GraphVersion = "v21.0",
  [string]$WebhookUrl = "",
  [switch]$SubscribeApp
)

$ErrorActionPreference = "Stop"

# --- Token (nunca exibido) ---
$token = $env:META_ACCESS_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
  $secure = Read-Host "Cole o META_ACCESS_TOKEN (nao sera exibido)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $token = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
$token = $token.Trim().Trim('"').Trim("'")
$headers = @{ Authorization = "Bearer $token" }
$base = "https://graph.facebook.com/$GraphVersion"

function Invoke-Graph {
  param([string]$Method, [string]$Url)
  try {
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers
  } catch {
    $body = ""
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $body = $_.ErrorDetails.Message }
    Write-Host "  [ERRO] $($_.Exception.Message)" -ForegroundColor Red
    if ($body) { Write-Host "  Resposta da Meta: $body" -ForegroundColor Red }
    return $null
  }
}

Write-Host ""
Write-Host "1) Validando token e numero..." -ForegroundColor Cyan
$phone = Invoke-Graph -Method GET -Url "$base/$PhoneNumberId`?fields=display_phone_number,verified_name,quality_rating,code_verification_status"
if ($phone) {
  Write-Host "  [OK] Token valido. Numero: $($phone.display_phone_number) | Nome: $($phone.verified_name) | Qualidade: $($phone.quality_rating)" -ForegroundColor Green
} else {
  Write-Host "  Dica: erro 190 = token expirado/revogado. Gere um novo, atualize a Vercel e faca Redeploy." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "2) Apps inscritos na WABA..." -ForegroundColor Cyan
$subs = Invoke-Graph -Method GET -Url "$base/$WabaId/subscribed_apps"
if ($subs) {
  if ($subs.data -and $subs.data.Count -gt 0) {
    foreach ($app in $subs.data) {
      $name = $app.whatsapp_business_api_data.name
      if (-not $name) { $name = $app.name }
      Write-Host "  [OK] App inscrito: $name" -ForegroundColor Green
    }
  } else {
    Write-Host "  [ATENCAO] Nenhum app inscrito. Mensagens reais NAO chegarao no webhook." -ForegroundColor Yellow
    Write-Host "  Rode novamente com -SubscribeApp." -ForegroundColor Yellow
  }
}

if ($SubscribeApp) {
  Write-Host ""
  Write-Host "3) Inscrevendo o app na WABA..." -ForegroundColor Cyan
  $res = Invoke-Graph -Method POST -Url "$base/$WabaId/subscribed_apps"
  if ($res -and $res.success) {
    Write-Host "  [OK] App inscrito com sucesso." -ForegroundColor Green
  }
}

if ($WebhookUrl) {
  Write-Host ""
  Write-Host "4) Testando verificacao do webhook..." -ForegroundColor Cyan
  $verify = $env:VERIFY_TOKEN
  if ([string]::IsNullOrWhiteSpace($verify)) {
    $secure2 = Read-Host "Cole o VERIFY_TOKEN (nao sera exibido)" -AsSecureString
    $bstr2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure2)
    $verify = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr2)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr2)
  }
  $verify = $verify.Trim().Trim('"').Trim("'")
  $challenge = "teste_" + (Get-Random)
  $url = "$WebhookUrl`?hub.mode=subscribe&hub.verify_token=$([uri]::EscapeDataString($verify))&hub.challenge=$challenge"
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing
    if ($r.Content -eq $challenge) {
      Write-Host "  [OK] Webhook respondeu corretamente ao desafio." -ForegroundColor Green
    } else {
      Write-Host "  [ATENCAO] Webhook respondeu, mas o conteudo nao e o esperado." -ForegroundColor Yellow
    }
  } catch {
    Write-Host "  [ERRO] Webhook recusou (403 = VERIFY_TOKEN diferente ou faltou Redeploy)." -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "Concluido." -ForegroundColor Cyan
