Option Explicit

Dim inputPath, outputPath, word, doc
inputPath = WScript.Arguments(0)
outputPath = WScript.Arguments(1)

Set word = CreateObject("Word.Application")
word.Visible = False
word.DisplayAlerts = 0

On Error Resume Next
Set doc = word.Documents.Open(inputPath, False, True, False)
If Err.Number <> 0 Then
  WScript.Echo "OPEN_ERROR " & Err.Number & " " & Err.Description
  word.Quit
  WScript.Quit 2
End If

Err.Clear
doc.ExportAsFixedFormat outputPath, 17, False, 0, 0, 1, 1, 0, True, True, 1, True, True, False
If Err.Number <> 0 Then
  WScript.Echo "EXPORT_ERROR " & Err.Number & " " & Err.Description
  doc.Close False
  word.Quit
  WScript.Quit 3
End If

doc.Close False
word.Quit
WScript.Echo "OK"
