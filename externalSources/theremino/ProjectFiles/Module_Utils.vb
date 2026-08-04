
Imports System.Drawing.Drawing2D
Imports System.Management

Module Module_Utils

    ' =======================================================================================
    '  InitPictureboxImage
    ' =======================================================================================
    'Friend Sub InitPictureboxImage(ByVal pbox As PictureBox)
    '    With pbox
    '        If .ClientSize.Height < 1 Then Return
    '        .Image = New Bitmap(.ClientSize.Width, .ClientSize.Height)
    '    End With
    'End Sub

    Friend Sub InitPictureboxImage(ByVal pbox As PictureBox)
        With pbox
            If .ClientSize.Height < 1 Then Return
            If .Image Is Nothing OrElse .Image.Width <> .ClientRectangle.Width _
                                 OrElse .Image.Height <> .ClientRectangle.Height Then
                .Image = New Bitmap(.ClientRectangle.Width, _
                                    .ClientRectangle.Height, _
                                    Imaging.PixelFormat.Format24bppRgb)
            End If
        End With
    End Sub


    ' =======================================================================================
    '  FILL BRUSH
    ' =======================================================================================
    Friend Function CreateFillBrush(ByVal pbox As PictureBox, _
                                ByVal angle As Single, _
                                ByVal blend As Int32) As LinearGradientBrush
        If pbox.ClientRectangle.Width < 1 Or _
           pbox.ClientRectangle.Height < 1 Then
            Return Nothing
        End If
        CreateFillBrush = New LinearGradientBrush(pbox.ClientRectangle, _
                                                  Color.Black, _
                                                  Color.Black, _
                                                  angle)
        Dim myBlend As ColorBlend = New ColorBlend()
        Select Case blend
            Case 1 ' multicolor
                myBlend.Positions = New Single() {0.0F, 0.4F, 0.5F, 0.6F, 1.0F}
                myBlend.Colors = New Color() {Color.FromArgb(255, 0, 0), _
                                              Color.FromArgb(255, 230, 0), _
                                              Color.FromArgb(250, 250, 0), _
                                              Color.FromArgb(230, 230, 0), _
                                              Color.FromArgb(0, 100, 0)}

            Case 2 ' multicolor reverse
                myBlend.Positions = New Single() {0.0F, 0.4F, 0.5F, 0.6F, 1.0F}
                myBlend.Colors = New Color() {Color.FromArgb(0, 200, 0), _
                                              Color.FromArgb(230, 230, 0), _
                                              Color.FromArgb(250, 250, 0), _
                                              Color.FromArgb(255, 230, 0), _
                                              Color.FromArgb(255, 0, 0)}
            Case 3 ' green
                myBlend.Positions = New Single() {0.0F, 0.4F, 0.5F, 0.9F, 1.0F}
                myBlend.Colors = New Color() {Color.FromArgb(200, 250, 150), _
                                              Color.FromArgb(80, 150, 100), _
                                              Color.FromArgb(80, 150, 0), _
                                              Color.FromArgb(80, 150, 0), _
                                              Color.FromArgb(250, 0, 0)}
            Case 4 ' red
                myBlend.Positions = New Single() {0.0F, 0.4F, 0.5F, 0.9F, 1.0F}
                myBlend.Colors = New Color() {Color.FromArgb(255, 200, 160), _
                                              Color.FromArgb(255, 150, 0), _
                                              Color.FromArgb(250, 120, 0), _
                                              Color.FromArgb(230, 80, 0), _
                                              Color.FromArgb(60, 0, 0)}
            Case 5 ' blue
                myBlend.Positions = New Single() {0.0F, 0.4F, 0.5F, 0.9F, 1.0F}
                myBlend.Colors = New Color() {Color.FromArgb(110, 190, 220), _
                                              Color.FromArgb(60, 130, 180), _
                                              Color.FromArgb(0, 120, 160), _
                                              Color.FromArgb(0, 100, 140), _
                                              Color.FromArgb(0, 20, 80)}
        End Select
        CreateFillBrush.InterpolationColors = myBlend
    End Function


    ' =======================================================================================
    '  Utils
    ' =======================================================================================
    Friend Sub SleepMyThread(ByVal TimeMillisec As Int32)
        System.Threading.Thread.Sleep(TimeMillisec)
    End Sub
    Friend Function Shell_NormalFocus(ByVal path As String) As Int32
        Try
            Return Shell(path, AppWinStyle.NormalFocus)
        Catch
            MsgBox("Cannot open the path: " & vbCr & path, MsgBoxStyle.Information)
            Return 0
        End Try
    End Function
    Friend Function MouseButtonLeftPressed() As Boolean
        Return (Control.MouseButtons And Windows.Forms.MouseButtons.Left) <> Windows.Forms.MouseButtons.None
    End Function
    Friend Function MouseButtonRightPressed() As Boolean
        Return (Control.MouseButtons And Windows.Forms.MouseButtons.Right) <> Windows.Forms.MouseButtons.None
    End Function

    Friend Sub Swap(ByRef n1 As Single, ByRef n2 As Single)
        Dim n3 As Single = n2
        n2 = n1
        n1 = n3
    End Sub
    Friend Sub Swap(ByRef n1 As Double, ByRef n2 As Double)
        Dim n3 As Double = n2
        n2 = n1
        n1 = n3
    End Sub
    Friend Sub Swap(ByRef n1 As Int32, ByRef n2 As Int32)
        Dim n3 As Int32 = n2
        n2 = n1
        n1 = n3
    End Sub


    ' ==============================================================================================================
    '   COMBO FUNCTIONS
    ' ==============================================================================================================
    Friend Sub Combo_Init(ByVal combo As ComboBox, ByVal str As String)
        Dim old As Boolean = EventsAreEnabled
        EventsAreEnabled = False
        If str = Nothing Then str = ""
        With combo
            .Items.Clear()
            .Items.Add(str)
            .SelectedIndex = 0
        End With
        EventsAreEnabled = old
    End Sub
    Friend Sub Combo_SetIndex_FromString(ByVal combo As ComboBox, ByVal str As String)
        Dim old As Boolean = EventsAreEnabled
        EventsAreEnabled = False
        If str = Nothing Then str = ""
        str = str.Trim
        With combo
            For i As Int32 = 0 To .Items.Count - 1
                If .Items(i).ToString.Trim = str Then
                    .SelectedIndex = i
                    Exit For
                End If
            Next
        End With
        EventsAreEnabled = old
    End Sub
    Friend Function Combo_GetValue(ByVal combo As ComboBox) As String
        If combo.SelectedIndex < 0 Then Return ""
        Return combo.Items(combo.SelectedIndex).ToString()
    End Function
    Friend Sub Combo_SetIndex(ByVal combo As ComboBox, ByVal index As Int32)
        If combo.Items.Count < 1 Then Exit Sub
        If index < 0 Then index = 0
        If index > combo.Items.Count - 1 Then index = combo.Items.Count - 1
        combo.SelectedIndex = index
    End Sub
    Friend Sub ComboTools_SetIndex(ByVal combo As ToolStripComboBox, ByVal index As Int32)
        If combo.Items.Count < 1 Then Exit Sub
        If index < 0 Then index = 0
        If index > combo.Items.Count - 1 Then index = combo.Items.Count - 1
        combo.SelectedIndex = index
    End Sub


    ' =============================================================================================
    '  ASYNC KEY and MOUSE STATE
    ' =============================================================================================
    Private Const PRESSED_NOW As Int32 = &H8000
    Private Const PRESSED_AFTER_PREVIOUS_CALL As Int32 = &H1
    Private Declare Function GetAsyncKeyState Lib "user32" (ByVal vKey As Int32) As Int16
    Friend Function KeyFromPreviousCall(ByVal k As Int32) As Boolean
        KeyFromPreviousCall = (GetAsyncKeyState(k) And PRESSED_AFTER_PREVIOUS_CALL) <> 0
    End Function
    Friend Function Key(ByVal k As Int32) As Boolean
        Key = (GetAsyncKeyState(k) And PRESSED_NOW) <> 0
    End Function
    'Friend Sub WaitMouseOff()
    '    While Key(Keys.LButton) Or Key(Keys.MButton) Or Key(Keys.RButton)
    '        SleepMyThread(1)
    '    End While
    'End Sub
    'Friend Sub WaitKeyOff(ByVal WaitKey As Long)
    '    Do
    '        SleepMyThread(1)
    '    Loop Until Not Key(WaitKey)
    'End Sub


    ' ================================================================================
    '  Wavelength To Color
    ' ================================================================================
    Friend Function WavelengthToColor(ByVal Wavelength As Double) As Color
        Dim Blue As Double
        Dim Green As Double
        Dim Red As Double
        Dim Factor As Double
        If Wavelength >= 380 AndAlso Wavelength < 440 Then
            Red = -1 * (Wavelength - 440) / (440 - 380)
            Green = 0
            Blue = 1
        ElseIf Wavelength >= 440 AndAlso Wavelength < 490 Then
            Red = 0
            Green = (Wavelength - 440) / (490 - 440)
            Blue = 1
        ElseIf Wavelength >= 490 AndAlso Wavelength < 510 Then
            Red = 0
            Green = 1
            Blue = -1 * (Wavelength - 510) / (510 - 490)
        ElseIf Wavelength >= 510 AndAlso Wavelength < 580 Then
            Red = (Wavelength - 510) / (580 - 510)
            Green = 1
            Blue = 0
        ElseIf Wavelength >= 580 AndAlso Wavelength < 645 Then
            Red = 1
            Green = -1 * (Wavelength - 645) / (645 - 580)
            Blue = 0
        ElseIf Wavelength >= 645 AndAlso Wavelength <= 780 Then
            Red = 1
            Green = 0
            Blue = 0
        Else
            Red = 0
            Green = 0
            Blue = 0
        End If
        ' ------------------------------------------------------------ gradual dim to invisible ranges
        Const IR2 As Single = 780 ' original = 780
        Const IR1 As Single = 650 ' original = 700
        Const UV2 As Single = 420
        Const UV1 As Single = 380
        If Wavelength > IR2 Or Wavelength < UV1 Then
            Factor = 0
        ElseIf Wavelength > IR1 Then
            Factor = (IR2 - Wavelength) / (IR2 - IR1)
        ElseIf (Wavelength < UV2) Then
            Factor = (Wavelength - UV1) / (UV2 - UV1)
        Else
            Factor = 1
        End If
        ' ------------------------------------------------------------ make the color
        Return Color.FromArgb(CInt(255 * Red * Factor), _
                              CInt(255 * Green * Factor), _
                              CInt(255 * Blue * Factor))
    End Function


    ' =======================================================================================================
    '   REDIM PRESERVE BIDIMENSIONAL STRING ARRAY
    ' =======================================================================================================
    Friend Sub RedimPreserve_2D_Array(ByRef ar(,) As String, ByVal rowUpperIdx As Int32, ByVal colUpperIdx As Int32)
        Dim newArray(rowUpperIdx, colUpperIdx) As String
        Dim minRows As Integer = Math.Min(rowUpperIdx + 1, ar.GetLength(0))
        Dim minCols As Integer = Math.Min(colUpperIdx + 1, ar.GetLength(1))
        For i As Int32 = 0 To minRows - 1
            For j As Int32 = 0 To minCols - 1
                newArray(i, j) = ar(i, j)
            Next
        Next
        ar = newArray
    End Sub


    ' =======================================================================================================
    '   FadeIn and FadeOut 
    ' =======================================================================================================
    Friend Sub Forms_FadeTo(ByVal FinalValue As Double, ByVal TimeMillisec As Double)
        Try
            If TimeMillisec < 1 Then TimeMillisec = 1
            Dim v As Double
            Dim k As Double
            Dim date1 As Date
            '
            Dim StartValue As Double = Form1.Opacity
            '
            Application.DoEvents()
            System.Threading.Thread.Sleep(1)
            date1 = Date.Now
            Do
                k = Date.Now.Subtract(date1).TotalMilliseconds / TimeMillisec
                If k > 1 Then k = 1
                v = StartValue + (FinalValue - StartValue) * k
                If FinalValue = 0 Then
                    v = v * 0.5
                End If
                Form1.Opacity = v
                Form_VideoInControls.Opacity = v
                Form_Info.Opacity = v
                System.Threading.Thread.Sleep(20)
                'Debug.Print(v.ToString)
            Loop Until k >= 1
        Catch
            Form1.Opacity = 1
            Form_VideoInControls.Opacity = 1
        End Try
    End Sub


    ' ===============================================================
    '  WINDOWS SCHEDULER PRECISION
    ' =============================================================== 
    <System.Runtime.InteropServices.DllImport("winmm.dll")> _
    Private Function timeBeginPeriod(ByVal uPeriod As Int32) As Int32
    End Function
    <System.Runtime.InteropServices.DllImport("winmm.dll")> _
    Private Function timeEndPeriod(ByVal uPeriod As Int32) As Int32
    End Function
    Friend Sub MillisecondPrecision_Start()
        timeBeginPeriod(1)
    End Sub
    Friend Sub MillisecondPrecision_End()
        timeEndPeriod(1)
    End Sub


    ' =============================================================================================
    '  SELECT FILE WITH SENDKEYS
    ' ============================================================================================= 
    ' ------------------------------------------------------------------------------------------
    '  When using this function you must also set Milliseconds precision
    '  otherwise the Dialogs will be very slow to open
    ' ------------------------------------------------------------------------------------------
    Friend Sub SelectFileWithSendKeys(ByVal FileName As String, ByVal DirectoryPath As String)
        ' -------------------------------------------------------------------------------
        If Not IO.Directory.Exists(DirectoryPath) Then Return
        ' -------------------------------------------------------------------------------
        ' Some Initial Time is required before to send the FileName
        ' otherwise FileDialogs with many files generates an error (SOUND)
        ' and does not select the file.
        ' ------------------------------------------------------------------------------- wait some time
        Dim numFiles As Int32 = New IO.DirectoryInfo(DirectoryPath).GetFiles().Length
        For i As Int32 = 1 To numFiles \ 5
            SendKeys.Send("{HOME}")   ' 
        Next
        ' ------------------------------------------------------------------------------- select the file in the list
        SendKeys.Send("+{TAB}+{TAB}" + _
                      EscapeSpecialCharacters(FileName) + "{TAB}{TAB}")
        ' ------------------------------------------------------------------------------- deselect name
        'SendKeys.Send("{HOME}{END}^A") ' name visible and selected
        SendKeys.Send("{HOME}{END}")   ' name visible and unselected
    End Sub

    ' =============================================================================================
    '  EscapeSpecialCharacters for SendKeys
    ' ============================================================================================= 
    Friend Function EscapeSpecialCharacters(ByVal txt As String) As String
        txt = txt.Replace("+", "{+}")
        txt = txt.Replace("^", "{^}")
        txt = txt.Replace("%", "{%}")
        txt = txt.Replace("~", "{~}")
        txt = txt.Replace("(", "{(}")
        txt = txt.Replace(")", "{)}")
        Return txt
    End Function


    ' =============================================================================================
    '  VarPtr to IntPtr and Int32
    ' ============================================================================================= 
    'Public Function VarPtr(ByVal e As Object) As IntPtr
    '    Dim GC As System.Runtime.InteropServices.GCHandle = _
    '    System.Runtime.InteropServices.GCHandle.Alloc(e, System.Runtime.InteropServices.GCHandleType.Pinned)
    '    Dim GC2 As Int32 = GC.AddrOfPinnedObject.ToInt32
    '    GC.Free()
    '    Return CType(GC2, IntPtr)
    'End Function

    'Public Function VarPtr_Int(ByVal e As Object) As Int32
    '    Dim GC As System.Runtime.InteropServices.GCHandle = _
    '    System.Runtime.InteropServices.GCHandle.Alloc(e, System.Runtime.InteropServices.GCHandleType.Pinned)
    '    Dim GC2 As Int32 = GC.AddrOfPinnedObject.ToInt32
    '    GC.Free()
    '    Return GC2
    'End Function

    ' =======================================================================================================
    '  ONLY Positive Integer NUMERIC COMBO BOX
    ' -------------------------------------------------------------------------------------------------------
    '  Call from KeyDown event with: OnlyNumericComboBox(sender, e)
    ' =======================================================================================================
    Friend Sub OnlyNumericComboBox(ByVal sender As Object, ByVal e As KeyEventArgs)
        ' ------------------------------------------------------ Allow navigation keyboard arrows
        Select Case e.KeyCode
            Case Keys.Up, Keys.Down, Keys.Left, Keys.Right, Keys.PageUp, Keys.PageDown, Keys.Delete
                e.SuppressKeyPress = False
                Return
        End Select
        ' ------------------------------------------------------ Block non-number characters
        Dim currentKey As Char = Chr(e.KeyCode)
        If Not My.Computer.Keyboard.CtrlKeyDown And _
           Not Char.IsControl(currentKey) And _
           Not Char.IsDigit(currentKey) And _
           Not e.KeyCode = Keys.OemMinus And _
           Not e.KeyCode = Keys.OemPeriod Then
            e.SuppressKeyPress = True
        End If
        ' -------------------------------------------------------- no decimal point
        If e.KeyCode = Keys.OemPeriod Then
            e.SuppressKeyPress = True
        End If
        ' -------------------------------------------------------- no minus sign
        If e.KeyCode = Keys.OemMinus Then
            e.SuppressKeyPress = True
        End If
        ' ------------------------------------------------------- Handle pasted Text
        If e.Control AndAlso e.KeyCode = Keys.V Then
            ' --------------------------------------------------- Preview paste data (removing non-number characters)
            Dim pasteText As String = Clipboard.GetText
            Dim strippedText As String = ""
            Dim i As Integer = 0
            Do While i < pasteText.Length
                If Char.IsDigit(pasteText(i)) Then
                    strippedText = strippedText + pasteText(i).ToString
                End If
                i = (i + 1)
            Loop
            ' --------------------------------------------------- If there were non-numbers in the pasted text
            If strippedText <> pasteText Then

                e.SuppressKeyPress = True
                ' ----------------------------------------------- OPTIONAL: Manually insert text stripped of non-numbers
                Dim tbox As ComboBox = CType(sender, ComboBox)
                Dim start As Integer = tbox.SelectionStart
                Dim newTxt As String = tbox.Text
                newTxt = newTxt.Remove(tbox.SelectionStart, tbox.SelectionLength)
                ' ----------------------------------------------- remove highlighted text
                newTxt = newTxt.Insert(tbox.SelectionStart, strippedText)
                ' ----------------------------------------------- paste
                tbox.Text = newTxt
                tbox.SelectionStart = start + strippedText.Length
            Else
                e.SuppressKeyPress = False
            End If
        End If
    End Sub

    ' =============================================================
    '    SmootValue Adaptive filter - Double version
    ' =============================================================
    Friend Sub SmoothValue_Pow_Adaptive(ByRef value As Double, ByVal new_value As Double, ByVal speed As Double)
        Dim delta As Double = new_value - value
        Dim delta_sgn As Double = Math.Sign(delta)
        Dim delta_abs As Double = Math.Abs(delta)
        Dim delta_pow As Double = (delta_abs ^ 2) * speed
        If value <> 0 Then delta_pow /= Math.Abs(value)
        If delta_pow >= delta_abs Then
            value = new_value
        Else
            value += delta_sgn * delta_pow
        End If
        ' ------------------ if not equal to itself then it is a NAN
        If value <> value Then value = 0
    End Sub

    ' =============================================================
    '    SmootValue Simple - Double version
    ' =============================================================
    Friend Sub SmoothValue_Simple(ByRef value As Double, ByVal new_value As Double, ByVal speed As Double)
        value += (new_value - value) * speed
    End Sub



    ' =======================================================================================================
    '   Mixed functions
    ' =======================================================================================================
    Friend Function ReplaceMultipleSpacesAndTabAndTrim(ByVal s As String) As String
        s = s.Replace(vbTab, " ")
        While s.Contains("  ")
            s = s.Replace("  ", " ")
        End While
        Return s.Trim
    End Function

    Friend Function ReplaceMultipleSpacesAndTrim(ByVal s As String) As String
        While s.Contains("  ")
            s = s.Replace("  ", " ")
        End While
        Return s.Trim
    End Function

    Friend Function RemoveComments(ByRef s As String) As Int32
        Dim i As Int32 = s.IndexOf("'")
        If i > 0 Then s = s.Remove(i).TrimEnd
        If i = 0 Then s = ""
        Return i
    End Function

    Friend Function RemoveFirstWord(ByVal s As String) As String
        Dim i As Int32 = s.IndexOf(" ")
        If i > 0 Then s = s.Remove(0, i).Trim
        Return s
    End Function

    ' =======================================================================================================
    '   ENABLE DISABLE CONTROLS
    ' =======================================================================================================
    Friend Sub EnableControls(ByVal ctrl As Control)
        For Each c As Control In ctrl.Controls
            c.Enabled = True
        Next
    End Sub

    Friend Sub DisableControls(ByVal ctrl As Control)
        For Each c As Control In ctrl.Controls
            c.Enabled = False
        Next
    End Sub

    ' =======================================================================================================
    '   SecondsToHrsMinSec
    ' =======================================================================================================
    Friend Function SecondsToHrsMinSec(ByVal seconds As Double) As String
        Dim t As TimeSpan = TimeSpan.FromSeconds(seconds)
        If seconds >= 3600 Then
            Return t.Hours.ToString("0") + ":" + t.Minutes.ToString("00") + ":" + t.Seconds.ToString("00")
        Else
            Return t.Minutes.ToString("0") + ":" + t.Seconds.ToString("00")
        End If
    End Function

End Module
