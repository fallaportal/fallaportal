# Exporta un certificat .docx a PDF amb Word (per a signar amb certificat digital / Autofirma).
# Us: powershell -File certificat_pdf.ps1 -Docx ..\Certificat_X.docx [-Pdf ..\Certificat_X.pdf]
# Si el PDF de destinacio esta obert en un altre programa (Acrobat...), Windows el bloqueja: tanca'l primer.
param([Parameter(Mandatory)][string]$Docx, [string]$Pdf)
$Docx = (Resolve-Path $Docx).Path
if (-not $Pdf) { $Pdf = [IO.Path]::ChangeExtension($Docx, '.pdf') }
$Pdf = [IO.Path]::GetFullPath($Pdf)
$w = New-Object -ComObject Word.Application
$w.Visible = $false
try {
  $d = $w.Documents.Open($Docx, $false, $true)   # nomes lectura: no crea fitxer de bloqueig ~$
  $d.ExportAsFixedFormat($Pdf, 17, $false, 0)
  "Pagines: " + $d.ComputeStatistics(2)
  $d.Close(0)
} finally { $w.Quit() }
"PDF: $Pdf"
