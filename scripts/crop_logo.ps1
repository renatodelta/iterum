Add-Type -AssemblyName System.Drawing

$srcPath = Convert-Path '.\Iterum-logo.jpg'
$originalBmp = New-Object System.Drawing.Bitmap ($srcPath)

# 1. Backup original
Copy-Item $srcPath '.\Iterum-logo-original.jpg' -Force

# Icon bounds: minX=302, maxX=958, minY=618, maxY=1174. Width=656, Height=556.
# Center of icon:
$cx = [int]((302 + 958) / 2)
$cy = [int]((618 + 1174) / 2)
$size = [Math]::Max(656, 556)
# Add a little padding (e.g. 5% padding)
$pad = [int]($size * 0.08)
$boxSize = $size + ($pad * 2)
$startX = [Math]::Max(0, [int]($cx - ($boxSize / 2)))
$startY = [Math]::Max(0, [int]($cy - ($boxSize / 2)))

Write-Output "Cropping icon square from ($startX, $startY) with size $boxSize"

# Create target 512x512 icon bitmap
$targetIcon = New-Object System.Drawing.Bitmap 512, 512
$gIcon = [System.Drawing.Graphics]::FromImage($targetIcon)
$gIcon.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gIcon.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gIcon.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gIcon.Clear([System.Drawing.Color]::White)

$srcRect = New-Object System.Drawing.Rectangle $startX, $startY, $boxSize, $boxSize
$destRect = New-Object System.Drawing.Rectangle 0, 0, 512, 512
$gIcon.DrawImage($originalBmp, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$gIcon.Dispose()

# Save icon as public/iterum-logo.jpg and public/iterum-icon.png
$targetIcon.Save('.\public\iterum-logo.jpg', [System.Drawing.Imaging.ImageFormat]::Jpeg)
$targetIcon.Save('.\public\iterum-icon.png', [System.Drawing.Imaging.ImageFormat]::Png)
$targetIcon.Save('.\iterum-logo.jpg', [System.Drawing.Imaging.ImageFormat]::Jpeg)
$targetIcon.Dispose()

# 2. Also crop full horizontal logo (symbol + text) with balanced padding
# Bounds: minX=304, maxX=2096, minY=616, maxY=1176. Width=1792, Height=560
$fullPadX = 60
$fullPadY = 50
$fX = [Math]::Max(0, 304 - $fullPadX)
$fY = [Math]::Max(0, 616 - $fullPadY)
$fW = [Math]::Min($originalBmp.Width - $fX, 1792 + ($fullPadX * 2))
$fH = [Math]::Min($originalBmp.Height - $fY, 560 + ($fullPadY * 2))

Write-Output "Cropping full horizontal logo from ($fX, $fY) with size $fW x $fH"

$targetFull = New-Object System.Drawing.Bitmap 960, 360
$gFull = [System.Drawing.Graphics]::FromImage($targetFull)
$gFull.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gFull.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gFull.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gFull.Clear([System.Drawing.Color]::White)

$srcFullRect = New-Object System.Drawing.Rectangle $fX, $fY, $fW, $fH
# Aspect ratio preservation
$aspect = $fW / $fH
$targetH = [int](920 / $aspect)
$targetY = [int]((360 - $targetH) / 2)
$destFullRect = New-Object System.Drawing.Rectangle 20, $targetY, 920, $targetH
$gFull.DrawImage($originalBmp, $destFullRect, $srcFullRect, [System.Drawing.GraphicsUnit]::Pixel)
$gFull.Dispose()

$targetFull.Save('.\public\iterum-horizontal.jpg', [System.Drawing.Imaging.ImageFormat]::Jpeg)
$targetFull.Save('.\public\iterum-horizontal.png', [System.Drawing.Imaging.ImageFormat]::Png)
$targetFull.Dispose()

$originalBmp.Dispose()
Write-Output "Success generating cropped logos!"
