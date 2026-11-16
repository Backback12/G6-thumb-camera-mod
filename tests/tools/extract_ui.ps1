# Read-only extraction from the copied image; PNG preview requires Windows/System.Drawing.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tests/tools/extract_ui.ps1
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$testsRoot = Split-Path $PSScriptRoot -Parent
$source = Join-Path $testsRoot 'original/backup1.bin'
$output = Join-Path $testsRoot 'analysis'
$rom = [IO.File]::ReadAllBytes($source)
if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne
    '278551EA79D1485115E52D2E4E2AD49CE8AA616BEDD6BABD15D194A41E286184') {
    throw 'Expected the original backup1.bin; no firmware is written.'
}
function U16([int]$offset) { [BitConverter]::ToUInt16($rom, $offset) }
function U32([int]$offset) { [BitConverter]::ToUInt32($rom, $offset) }
$directory = (U32 ($rom[9]*16+8))*512
function Resource([int]$index) {
    [pscustomobject]@{ Offset=$directory+(U32 ($directory+$index*8)); Length=(U32 ($directory+$index*8+4)) }
}
$icons = Resource 12
$palette = Resource 13
$glyphs = Resource 10
$languages = Resource 11
$iconCount = (U32 ($icons.Offset+8))/12
$stringsBase = $languages.Offset+(U32 ($languages.Offset+12)) # Language 0: English.
$stringCount = ((U32 ($languages.Offset+8)) -shr 8) -band 255
if ($iconCount -ne 69 -or $palette.Length -ne 1024 -or $stringCount -ne 160) {
    throw 'Unexpected UI resource layout.'
}
function UiText([int]$id) {
    if ($id -lt 0 -or $id -ge $stringCount) { throw 'Invalid text ID' }
    $record = $stringsBase+8*($id+1)
    $list = $stringsBase+(U16 ($record+6))
    $text = [Text.StringBuilder]::new()
    for ($i=0; $i -lt (U16 ($record+4)); $i++) {
        $glyph = (U16 ($list+2*$i)) -band 0x3FFF
        if ($glyph -lt 7) { $character = @(' ','!','"',',','-','.','/')[$glyph] }
        elseif ($glyph -lt 17) { $character = [char]($glyph+41) }
        elseif ($glyph -eq 17) { $character = ':' }
        elseif ($glyph -lt 44) { $character = [char]($glyph+47) }
        elseif ($glyph -lt 70) { $character = [char]($glyph+53) }
        else { $character = '<glyph:{0:X4}>' -f $glyph }
        [void]$text.Append($character)
    }
    $text.ToString()
}
# Visual descriptions; UI uses below are separately recovered from layout/settings records.
$names = ('microphone|battery in circle|clock|lined container|empty container|plus/minus|' +
    'camera with rays|SD card|car with waves|Hz|palette|A in circle|light bulb|padlock|' +
    'hourglass|eye|half-filled circle|walking person|power|R with arrow|HD|rotation|' +
    'sun|camera outline|monitor|TV|key|information|speaker|fast forward|' +
    'red empty battery|empty battery|low battery fill|higher battery fill|full battery|' +
    'battery with lightning|fast forward|flash auto|flash off|flash on|padlock|settings list|' +
    'muted microphone|microphone|right arrow|walking person|empty checkbox|checkmark|' +
    'teal checked box|white checked box|repeat arrows|repeat variant|pause|large teal pause|' +
    'landscape/photo|play|large teal play|teal play square|video camera|TF card|TF card X|' +
    'fast forward chevrons|repeat one|repeat all|right arrow|shuffle|large red battery|' +
    'empty camera|large TF card X').Split('|')
if ($names.Count -ne $iconCount) { throw 'Icon description count mismatch.' }
$uses = @{0x1E='battery level 0'; 0x1F='battery level 1'; 0x20='battery level 2';
    0x21='battery level 3'; 0x22='battery out-of-range fallback'; 0x23='external-power indicator';
    0x25='photo light: other/auto'; 0x26='photo/video light off'; 0x27='photo/video light on';
    0x36='photo HUD'; 0x3A='video HUD'; 0x3B='photo/video TF-card status'}
for ($i=0; $i -lt (U32 0x9418); $i++) {
    $record = 0x9420+20*$i
    $iconId = [int]((U32 ($record+4)) -band 0xFFFFFF)
    $label = UiText ((U32 ($record+8)) -band 0xFFFFFF)
    $previous = if ($uses.ContainsKey($iconId)) { $uses[$iconId]+'; ' } else { '' }
    $uses[$iconId] = $previous+('setting: {0} @0x{1:X6}' -f $label,$record)
}
$iconTable = [Text.StringBuilder]::new("resource_id`trecord_offset`twidth`theight`tpixel_offset`tbytes`tvisual`tui_use`r`n")
Add-Type -AssemblyName System.Drawing
$sheet = [Drawing.Bitmap]::new(1088,1530)
$graphics = [Drawing.Graphics]::FromImage($sheet)
$font = [Drawing.Font]::new('Consolas',12)
try {
    $graphics.Clear([Drawing.Color]::FromArgb(38,42,48))
    for ($id=0; $id -lt $iconCount; $id++) {
        $record = $icons.Offset+12*$id
        $width = U32 $record
        $height = U32 ($record+4)
        $pixels = $icons.Offset+(U32 ($record+8))
        $length = $width*$height
        if ($width -lt 1 -or $height -lt 1 -or $pixels+$length -gt $icons.Offset+$icons.Length) {
            throw 'Bitmap outside icon resource.'
        }
        $usage = if ($uses.ContainsKey($id)) { $uses[$id] } else { '' }
        [void]$iconTable.AppendLine(('0x{0:X8}`t0x{1:X6}`t{2}`t{3}`t0x{4:X6}`t{5}`t{6}`t{7}' -f
            [uint32](2147483648+$id),$record,$width,$height,$pixels,$length,$names[$id],$usage).Replace('`t',"`t"))
        $scale = [Math]::Min(4,[Math]::Floor(128/[Math]::Max($width,$height)))
        $tileX = ($id%8)*136
        $tileY = [Math]::Floor($id/8)*170
        $graphics.DrawString(('{0:X2} {1}x{2}' -f $id,$width,$height),$font,[Drawing.Brushes]::White,($tileX+6),($tileY+4))
        for ($y=0; $y -lt $height; $y++) {
            for ($x=0; $x -lt $width; $x++) {
                $word = U32 ($palette.Offset+4*$rom[$pixels+$y*$width+$x])
                # Preview interpretation: RGB565 in bits 0..15, opacity in bits 16..20.
                $color = [Drawing.Color]::FromArgb([int]((($word -shr 16)-band 31)*255/31),
                    [int]((($word -shr 11)-band 31)*255/31),[int]((($word -shr 5)-band 63)*255/63),[int](($word-band 31)*255/31))
                $brush = [Drawing.SolidBrush]::new($color)
                try { $graphics.FillRectangle($brush,[int]($tileX+4+$x*$scale),[int]($tileY+30+$y*$scale),[int]$scale,[int]$scale) }
                finally { $brush.Dispose() }
            }
        }
    }
    $sheet.Save((Join-Path $output 'icons.png'),[Drawing.Imaging.ImageFormat]::Png)
}
finally { $font.Dispose(); $graphics.Dispose(); $sheet.Dispose() }
$textTable = [Text.StringBuilder]::new("resource_id`trecord_offset`twidth`theight`tglyph_count`ttext`r`n")
for ($id=0; $id -lt $stringCount; $id++) {
    $record = $stringsBase+8*($id+1)
    [void]$textTable.AppendLine(('0x{0:X8}`t0x{1:X6}`t{2}`t{3}`t{4}`t{5}' -f
        [uint32](2164260864+$id),$record,(U16 $record),(U16 ($record+2)),(U16 ($record+4)),(UiText $id)).Replace('`t',"`t"))
}
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $output 'icons.tsv'),$iconTable.ToString(),$utf8)
[IO.File]::WriteAllText((Join-Path $output 'ui_text.tsv'),$textTable.ToString(),$utf8)
Write-Output ('Extracted {0} icons and {1} English text entries; source unchanged.' -f $iconCount,$stringCount)
