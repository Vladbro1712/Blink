$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path 'public\covers' | Out-Null
$specs = @(
  @{ id='photo-1470225620780-dba8ba36b745'; top='#b5aaa0'; bottom='#45433e'; sun='#ded1b8'; ground='#777363' },
  @{ id='photo-1519608487953-e999c86e7455'; top='#777c83'; bottom='#373b41'; sun='#c6c4bc'; ground='#525b5b' },
  @{ id='photo-1470770841072-f978cf4d019e'; top='#879387'; bottom='#555c50'; sun='#d9cbb1'; ground='#626c5c' },
  @{ id='photo-1500530855697-b586d89ba3ee'; top='#a39578'; bottom='#56594a'; sun='#ead8b4'; ground='#73705d' },
  @{ id='photo-1470252649378-9c29740c9fa8'; top='#af8770'; bottom='#48443f'; sun='#ead3a8'; ground='#746557' },
  @{ id='photo-1475924156734-496f6cac6ec1'; top='#b0957b'; bottom='#5a5751'; sun='#f0d7ad'; ground='#7a6d5b' }
)
function ToColor($s) { [System.Drawing.ColorTranslator]::FromHtml($s) }
foreach ($spec in $specs) {
  $bmp = New-Object System.Drawing.Bitmap 720, 500
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $rect = New-Object System.Drawing.Rectangle 0, 0, 720, 500
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect,(ToColor $spec.top),(ToColor $spec.bottom),90)
  $g.FillRectangle($brush,$rect)
  $sunBrush = New-Object System.Drawing.SolidBrush((ToColor $spec.sun))
  $g.FillEllipse($sunBrush,475,95,96,96)
  $ridgeBrush = New-Object System.Drawing.SolidBrush((ToColor $spec.ground))
  $points = [System.Drawing.Point[]]@([System.Drawing.Point]::new(0,355),[System.Drawing.Point]::new(130,245),[System.Drawing.Point]::new(248,330),[System.Drawing.Point]::new(375,205),[System.Drawing.Point]::new(520,345),[System.Drawing.Point]::new(650,250),[System.Drawing.Point]::new(720,310),[System.Drawing.Point]::new(720,500),[System.Drawing.Point]::new(0,500))
  $g.FillPolygon($ridgeBrush,$points)
  $foreground = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(85,30,32,28))
  $g.FillRectangle($foreground,0,420,720,80)
  $bmp.Save((Join-Path 'public\covers' ($spec.id+'.jpg')),[System.Drawing.Imaging.ImageFormat]::Jpeg)
  $g.Dispose();$bmp.Dispose();$brush.Dispose();$sunBrush.Dispose();$ridgeBrush.Dispose();$foreground.Dispose()
}
