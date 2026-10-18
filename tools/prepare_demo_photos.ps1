$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$workspacePath = Split-Path -Parent $PSScriptRoot
$catalog = Get-Content (Join-Path $workspacePath 'data/schoolCatalog.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($item in $catalog) {
    $folderPath = Join-Path $workspacePath ('server-data/garments/' + $item.id)
    $photoPath = Join-Path $folderPath 'photo.jpg'
    if (-not (Test-Path -LiteralPath $photoPath)) { continue }
    $image = [Drawing.Image]::FromFile($photoPath)
    try {
        $image.Save((Join-Path $folderPath 'closet.png'), [Drawing.Imaging.ImageFormat]::Png)
        $thumbnail = New-Object Drawing.Bitmap(150, 200)
        $graphics = [Drawing.Graphics]::FromImage($thumbnail)
        try {
            $graphics.DrawImage($image, 0, 0, 150, 200)
            $thumbnail.Save((Join-Path $folderPath 'closet-thumbnail.png'), [Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $thumbnail.Dispose() }
    } finally { $image.Dispose() }
}
