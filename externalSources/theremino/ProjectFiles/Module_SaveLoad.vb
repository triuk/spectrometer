
Imports System.Drawing.Imaging

Module Module_SaveLoad

    Friend FileFormat As String = ""
    Friend ConnectedAtStart As Boolean = True
    Friend LastLoadedFile As String = ""
    Friend LastFileLoadedOrSavedByUser As String = ""

    Friend GCI As Globalization.CultureInfo = Globalization.CultureInfo.InvariantCulture

    ' =======================================================================================================
    '   APP TITLE AND VERSION (ALL FIELDS)
    ' =======================================================================================================
    Friend Function AppTitleAndVersion(Optional ByVal RemoveThereminoPrefix As Boolean = False) As String
        Dim appname As String = IO.Path.GetFileNameWithoutExtension(Application.ExecutablePath)
        Dim Title As String = Replace(appname, "_", " ")
        If RemoveThereminoPrefix Then Title = Replace(Title, "Theremino ", "")
        Return Title + " - V" + GetVersionString()
    End Function

    ' =======================================================================================================
    '   GET VERSION (ALSO TRIPLE OR QUADRUPLE FIELDS)
    ' =======================================================================================================
    Friend Function GetVersionString() As String
        Dim s() As String = Split(My.Application.Info.Version.ToString, ".")
        GetVersionString = s(0) + "." + s(1)
        If s(2) <> "0" Then
            GetVersionString += "." + s(2)
            If s(3) <> "0" Then
                GetVersionString += "." + s(3)
            End If
        End If
    End Function

    ' =======================================================================================
    '  FORM FUNCTIONS
    ' =======================================================================================
    Friend Sub LimitFormPosition_CompletelyVisible(ByVal f As System.Windows.Forms.Form)
        If f.WindowState <> FormWindowState.Normal Then Return
        GetMaxScreenBounds()
        EnsureFormCompletelyVisible(f)
    End Sub

    Friend Sub LimitFormPosition(ByVal f As System.Windows.Forms.Form)
        If f.WindowState <> FormWindowState.Normal Then Return
        GetMaxScreenBounds()
        EnsureFormVisible(f)
    End Sub

    Private SB As Rectangle = New Rectangle(Integer.MaxValue, Integer.MaxValue, Integer.MinValue, Integer.MinValue)

    Private Sub GetMaxScreenBounds()
        For Each s As Screen In System.Windows.Forms.Screen.AllScreens
            SB = Rectangle.Union(SB, s.WorkingArea)
        Next
    End Sub

    Private Sub EnsureFormCompletelyVisible(ByVal frm As Form)
        With frm
            .Width = Math.Min(.Width, SB.Width)         ' not more than a maximized window
            .Height = Math.Min(.Height, SB.Height)      ' not more than a maximized window
            .Width = Math.Max(.Width, 32)               ' at least 32x24
            .Height = Math.Max(.Height, 24)             ' at least 32x24
            .Left = Math.Min(.Left, SB.Right - .Width)  ' not beyond the right border
            .Top = Math.Min(.Top, SB.Bottom - .Height)  ' not beyond the bottom border
            .Left = Math.Max(.Left, SB.Left)            ' at least at the left border
            .Top = Math.Max(.Top, SB.Top)               ' at least at the top border
        End With
    End Sub

    Private Sub EnsureFormVisible(ByVal frm As Form)
        With frm
            .Width = Math.Min(.Width, SB.Width)             ' not more than VIRTUALSCREEN dimensions
            .Height = Math.Min(.Height, SB.Height)          ' not more than VIRTUALSCREEN dimensions 
            .Width = Math.Max(.Width, 32)                   ' at least 32x24
            .Height = Math.Max(.Height, 24)                 ' at least 32x24
            .Left = Math.Min(.Left, SB.Right - 200)         ' not beyond right border - 200 pixels
            .Top = Math.Min(.Top, SB.Bottom - 80)          ' not beyond bottom border - 80 pixels
            .Left = Math.Max(.Left, SB.Left + 200 - .Width) ' at least at left border + 200 pixels
            .Top = Math.Max(.Top, SB.Top)                   ' at least at top border
        End With
    End Sub

    ' (The value of the RestoreBounds property is valid only 
    '   when the WindowState property of the Form class is not equal to Normal)
    Friend Function GetFormRectangle(ByVal frm As Form) As Rectangle
        Dim r As Rectangle
        If frm.WindowState = FormWindowState.Normal Then
            r = frm.Bounds
        Else
            r = frm.RestoreBounds
        End If
        Return r
    End Function


    ' ================================================================================================
    '  Private Read-Write functions
    ' ================================================================================================
    Private Function TabString(ByVal Name As String, _
                               Optional ByVal Value As Double = Double.NaN, _
                               Optional ByVal fmt As String = "") As String

        Dim nTab As Int32 = Math.Max(0, 22 - Name.Length)
        If Double.IsNaN(Value) Then
            Return Name
        Else
            Return Name & "=" & Strings.StrDup(nTab, " ") & Value.ToString(fmt, GCI)
        End If
    End Function
    Private Function TabString(ByVal Name As String, _
                               ByVal Value As Boolean) As String

        Dim nTab As Int32 = Math.Max(0, 22 - Name.Length)

        Return Name & "=" & Strings.StrDup(nTab, " ") & Value.ToString
    End Function
    Private Function TabString(ByVal Name As String, _
                               ByVal Value As String) As String

        Dim nTab As Int32 = Math.Max(0, 22 - Name.Length)

        Return Name & "=" & Strings.StrDup(nTab, " ") & Value
    End Function
    Private Function Val_Single(ByVal l As String) As Single
        Return CSng(Val(l.Replace(",", ".")))
    End Function

    Private Function Val_Double(ByVal l As String) As Double
        Return Val(l.Replace(",", "."))
    End Function

    Private Function Val_Int(ByVal l As String) As Int32
        Return CInt(Val(l))
    End Function

    Friend Function ExtractParamName(ByRef s As String) As String
        ' ------------------------- Returns the first field from begin to the first "=" symbol
        ' -------------------------  and removes it from the string
        Dim i As Integer
        i = InStr(s, "=")
        If i > 0 Then
            ExtractParamName = Trim(Strings.Left(s, i - 1))
            s = Trim(Mid(s, i + 1))
        Else
            ExtractParamName = Trim(s)
            s = ""
        End If
    End Function

    Private Function AssemblyName() As String
        Return System.Reflection.Assembly.GetExecutingAssembly.GetName.Name
    End Function


    ' ==================================================================================================
    '  SAVE LOAD -- Program INI
    ' ==================================================================================================
    Friend FormInfo_VisibleAtStart As Boolean
    Friend FormInfo_Left As Int32
    Friend FormInfo_Top As Int32
    Friend FormInfo_Width As Int32
    Friend FormInfo_Height As Int32


    Friend Sub Save_INI()
        Dim iniFileName As String = Application.StartupPath & "\" & AssemblyName() & "_INI.txt"
        Dim f As System.IO.StreamWriter = Nothing
        Try
            f = IO.File.CreateText(iniFileName)
            '
            f.WriteLine(" Program Params")
            f.WriteLine("===========================================")
            '
            f.WriteLine(" Program Params")
            f.WriteLine("===========================================")
            Dim r As Rectangle
            r = GetFormRectangle(Form1)
            f.WriteLine(TabString("FormMain_Top", r.Top))
            f.WriteLine(TabString("FormMain_Left", r.Left))
            f.WriteLine(TabString("FormMain_Width", r.Width))
            f.WriteLine(TabString("FormMain_Height", r.Height))
            f.WriteLine(TabString("FormMain_WindowState", Form1.WindowState))
            '
            f.WriteLine(TabString(""))
            r = GetFormRectangle(Form_Info)
            f.WriteLine(TabString("FormInfo_Top", r.Top))
            f.WriteLine(TabString("FormInfo_Left", r.Left))
            f.WriteLine(TabString("FormInfo_Width", r.Width))
            f.WriteLine(TabString("FormInfo_Height", r.Height))
            f.WriteLine(TabString("FormInfo_WindowState", Form_Info.WindowState))
            f.WriteLine(TabString("FormInfo_VisibleAtStart", Form_Info.Visible And Form_Info.WindowState <> FormWindowState.Minimized))
            '
            f.WriteLine(TabString(""))
            f.WriteLine(TabString(" Menu and Tools"))
            f.WriteLine(TabString("==========================================="))
            f.WriteLine(TabString("SensorType", SENSOR_Type))
            f.WriteLine(TabString("SpectrumFileSeparator", SpectrumFileSeparator))
            f.WriteLine(TabString("SpectrumFileType", SpectrumFileType))
            f.WriteLine(TabString("SlotCommands", CommandSlotText))
            f.WriteLine(TabString("SlotResponses", ResponseSlotText))
            f.WriteLine(TabString("Language", Language))
            f.WriteLine(TabString("SaveTime", Form1.Cmb_SaveTime.SelectedIndex))
            f.WriteLine(TabString("Repeat", Form1.Tools_Repeat.Checked))
            f.WriteLine(TabString("Options", Form1.Tools_Options.Checked))
            '
            f.WriteLine(TabString(""))
            f.WriteLine(TabString(" COM PORT Params"))
            f.WriteLine(TabString("==========================================="))
            f.WriteLine(TabString("ComPort", Form1.cmb_ComPort.Text))
            f.WriteLine(TabString("ComSpeed", Form1.Cmb_ComSpeed.Text))
            If SENSOR_Type = SensorTypes.WebCam Then
                f.WriteLine(TabString("Connected", WebCamIsWorking))
            Else
                f.WriteLine(TabString("Connected", COM_IsOpen()))
            End If
            '
            f.WriteLine(TabString(""))
            f.WriteLine(TabString(" Video Input Params"))
            f.WriteLine(TabString("==========================================="))
            f.WriteLine(TabString("VideoInDevice", VideoInDevice))
            f.WriteLine(TabString("VideoFormat", VideoFormatParams.VideoFormat))
            f.WriteLine(TabString("VideoSize", VideoFormatParams.VideoSize))
            f.WriteLine(TabString("VideoFPS", VideoFormatParams.VideoFPS))
            '
            r = GetFormRectangle(Form_VideoInControls)
            f.WriteLine(TabString("Form_VideoInControls_Top", r.Top))
            f.WriteLine(TabString("Form_VideoInControls_Left", r.Left))
            f.WriteLine(TabString("Form_VideoInControls_VisibleAtStart", Form_VideoInControls.Visible And Form_VideoInControls.WindowState <> FormWindowState.Minimized))
            '
            f.WriteLine(TabString(""))
            f.WriteLine(TabString(" Save Image"))
            f.WriteLine(TabString("==========================================="))
            f.WriteLine(TabString("FileName", Form1.txt_FileName.Text))
            f.WriteLine(TabString("FileFormat", FileFormat))
            f.WriteLine(TabString("FilePath", Form1.txt_FilePath.Text))
            '
            f.WriteLine(TabString(""))
            f.WriteLine(TabString(" Filters"))
            f.WriteLine(TabString("==========================================="))

            f.WriteLine(TabString("SpatialAveraging", Form1.txt_SpatialAveraging.NumericValueInteger))
            f.WriteLine(TabString("RisingSpeed", Form1.txt_RisingSpeed.NumericValueInteger))
            f.WriteLine(TabString("FallingSpeed", Form1.txt_FallingSpeed.NumericValueInteger))
            '
            f.WriteLine(TabString(""))
            f.WriteLine(TabString(" Sensor"))
            f.WriteLine(TabString("==========================================="))
            f.WriteLine(TabString("Resolution", Form1.Cmb_Resolution.SelectedIndex))
            f.WriteLine(TabString("AdcSpeed", Form1.Cmb_AdcSpeed.SelectedIndex))
            f.WriteLine(TabString("AutoExposureEnabled", AutoExposureEnabled))
            f.WriteLine(TabString("Exposure", Form1.Cmb_ExposureTime.SelectedIndex))
            f.WriteLine(TabString("AverageEnabled", AverageEnabled))
            f.WriteLine(TabString("Average", Form1.Cmb_Average.SelectedIndex))
            '
            f.WriteLine(TabString(""))
            f.WriteLine(TabString(" Sensor samples"))
            f.WriteLine(TabString("==========================================="))
            f.WriteLine(TabString("DebugType", Form1.Cmb_DebugType.SelectedIndex))
            f.WriteLine(TabString("Scale", Form1.Cmb_Scale.SelectedIndex))
            f.WriteLine(TabString("AdcMax", Form1.txt_AdcMax.NumericValueInteger))
            f.WriteLine(TabString("AdcMin", Form1.txt_AdcMin.NumericValueInteger))
            f.WriteLine(TabString("AdcMinAuto", Form1.chk_AdcMinAuto.Checked))
            f.WriteLine(TabString("StartX", Form1.txt_StartX.NumericValueInteger))
            f.WriteLine(TabString("FlipH", Form1.chk_FlipH.Checked))
            f.WriteLine(TabString("FlipV", Form1.chk_FlipV.Checked))
            f.WriteLine(TabString("EndX", Form1.txt_EndX.NumericValueInteger))
            f.WriteLine(TabString("StartY", Form1.txt_StartY.NumericValueInteger.ToString))
            f.WriteLine(TabString("SizeY", Form1.txt_SizeY.NumericValueInteger.ToString))
            '
            f.WriteLine(TabString(""))
            f.WriteLine(TabString(" Status bar"))
            f.WriteLine(TabString("==========================================="))
            f.WriteLine(TabString("LogScale", Form1.txt_LogScale.NumericValueInteger))
            f.WriteLine(TabString("Dips", Form1.btn_Dips.Checked))
            f.WriteLine(TabString("Peaks", Form1.btn_Peaks.Checked))
            f.WriteLine(TabString("Colors", Form1.btn_Colors.Checked))
            f.WriteLine(TabString("TrimScale", Form1.btn_TrimScale.Checked))
            '
            f.WriteLine(TabString(""))
            f.WriteLine(TabString(" Last files"))
            f.WriteLine(TabString("==========================================="))
            f.WriteLine(TabString("LastCalibrationFile", LastCalibrationFile))
            f.WriteLine(TabString("LastLoadedFile", LastLoadedFile))
            f.WriteLine(TabString("LastFileLoadedOrSavedByUser", LastFileLoadedOrSavedByUser))
            f.WriteLine(TabString("LastIrradianceCoeffsFile", LastIrradianceCoeffsFile))
        Catch
        End Try
        Try
            f.Close()
        Catch
        End Try
    End Sub


    Friend Sub Load_INI()
        ' ------------------------------------------------------------------------------- defaults
        VideoInDevice = ""
        VideoFormatParams.VideoFormat = "RGB42"
        VideoFormatParams.VideoSize = "320 x 240"
        VideoFormatParams.VideoFPS = "30"
        FileFormat = "JPG"
        ' -------------------------------------------------------------------------------
        ' ------------------------------------------------------------------------------- 
        ' With "Resume Next" subsequent parameters are loaded and f.Close() is executed
        ' -------------------------------------------------------------------------------
        On Error Resume Next  ' use Resume-Next instead of Try-Catch
        ' -------------------------------------------------------------------------------
        Dim l As String
        Dim iniFileName As String = Application.StartupPath & "\" & AssemblyName() & "_INI.txt"

        If My.Computer.FileSystem.FileExists(iniFileName) Then
            Dim f As System.IO.StreamReader
            f = IO.File.OpenText(iniFileName)
            Do While Not f.EndOfStream
                l = f.ReadLine()
                Select Case ExtractParamName(l)
                    Case "FormMain_Top" : Form1.Top = Val_Int(l)
                    Case "FormMain_Left" : Form1.Left = Val_Int(l)
                    Case "FormMain_Width" : Form1.Width = Val_Int(l)
                    Case "FormMain_Height" : Form1.Height = Val_Int(l)
                    Case "FormMain_WindowState" : Form1.WindowState = CType(Val(l), FormWindowState)
                        ' ------------------------------------------------------------------------------
                    Case "FormInfo_Top" : FormInfo_Top = Val_Int(l)
                    Case "FormInfo_Left" : FormInfo_Left = Val_Int(l)
                    Case "FormInfo_Width" : FormInfo_Width = Val_Int(l)
                    Case "FormInfo_Height" : FormInfo_Height = Val_Int(l)
                    Case "FormInfo_WindowState" : Form_Info.WindowState = CType(Val(l), FormWindowState)
                    Case "FormInfo_VisibleAtStart" : FormInfo_VisibleAtStart = l = "True"
                        ' ------------------------------------------------------------------------------
                    Case "SensorType" : SENSOR_Type = CType(l, SensorTypes)
                    Case "SpectrumFileSeparator" : SpectrumFileSeparator = l
                    Case "SpectrumFileType" : SpectrumFileType = l
                    Case "SlotCommands" : CommandSlotText = Val_Int(l)
                    Case "SlotResponses" : ResponseSlotText = Val_Int(l)
                    Case "Language" : Language = l
                    Case "SaveTime" : ComboTools_SetIndex(Form1.Cmb_SaveTime, Val_Int(l))
                    Case "Repeat" : Form1.Tools_Repeat.Checked = l = "True"
                    Case "Options" : Form1.Tools_Options.Checked = l = "True"
                        ' ------------------------------------------------------------------------------
                    Case "ComPort" : Form1.cmb_ComPort.Text = l
                    Case "ComSpeed" : Form1.Cmb_ComSpeed.Text = l
                    Case "Connected" : ConnectedAtStart = l = "True"
                        ' ------------------------------------------------------------------------------
                    Case "VideoInDevice" : VideoInDevice = l
                    Case "VideoFormat" : VideoFormatParams.VideoFormat = l
                    Case "VideoSize" : VideoFormatParams.VideoSize = l
                    Case "VideoFPS" : VideoFormatParams.VideoFPS = l
                        ' ------------------------------------------------------------------------------ 
                    Case "Form_VideoInControls_Top" : Form_VideoInControls.Top = Val_Int(l)
                    Case "Form_VideoInControls_Left" : Form_VideoInControls.Left = Val_Int(l)
                    Case "Form_VideoInControls_VisibleAtStart" : Form_VideoInControls_VisibleAtStart = l = "True"
                        ' ------------------------------------------------------------------------------
                    Case "FileName" : Form1.txt_FileName.Text = l
                    Case "FileFormat" : FileFormat = l
                    Case "FilePath" : Form1.txt_FilePath.Text = l
                        ' ------------------------------------------------------------------------------
                    Case "SpatialAveraging" : Form1.txt_SpatialAveraging.NumericValueInteger = Val_Int(l)
                    Case "RisingSpeed" : Form1.txt_RisingSpeed.NumericValueInteger = Val_Int(l)
                    Case "FallingSpeed" : Form1.txt_FallingSpeed.NumericValueInteger = Val_Int(l)
                        ' ------------------------------------------------------------------------------
                    Case "Resolution" : Combo_SetIndex(Form1.Cmb_Resolution, Val_Int(l))
                    Case "AdcSpeed" : Combo_SetIndex(Form1.Cmb_AdcSpeed, Val_Int(l))
                    Case "AutoExposureEnabled" : AutoExposureEnabled = l = "True"
                    Case "Exposure" : Combo_SetIndex(Form1.Cmb_ExposureTime, Val_Int(l))
                    Case "AverageEnabled" : AverageEnabled = l = "True"
                    Case "Average" : Combo_SetIndex(Form1.Cmb_Average, Val_Int(l))
                        ' ------------------------------------------------------------------------------
                    Case "DebugType" : Combo_SetIndex(Form1.Cmb_DebugType, Val_Int(l))
                    Case "Scale" : Combo_SetIndex(Form1.Cmb_Scale, Val_Int(l))
                    Case "AdcMax" : Form1.txt_AdcMax.NumericValueInteger = Val_Int(l)
                    Case "AdcMin" : Form1.txt_AdcMin.NumericValueInteger = Val_Int(l)
                    Case "AdcMinAuto" : Form1.chk_AdcMinAuto.Checked = l = "True"
                    Case "StartX" : Form1.txt_StartX.NumericValueInteger = Val_Int(l)
                    Case "FlipH" : Form1.chk_FlipH.Checked = l = "True"
                    Case "FlipV" : Form1.chk_FlipV.Checked = l = "True"
                    Case "EndX" : Form1.txt_EndX.NumericValueInteger = Val_Int(l)
                    Case "StartY" : Form1.txt_StartY.NumericValueInteger = Val_Int(l)
                    Case "SizeY" : Form1.txt_SizeY.NumericValueInteger = Val_Int(l)
                        ' ------------------------------------------------------------------------------
                    Case "LogScale" : Form1.txt_LogScale.NumericValueInteger = Val_Int(l)
                    Case "Dips" : Form1.btn_Dips.Checked = l = "True"
                    Case "Peaks" : Form1.btn_Peaks.Checked = l = "True"
                    Case "Colors" : Form1.btn_Colors.Checked = l = "True"
                    Case "TrimScale" : Form1.btn_TrimScale.Checked = l = "True"
                        ' ------------------------------------------------------------------------------
                    Case "LastCalibrationFile" : LastCalibrationFile = l
                    Case "LastLoadedFile" : LastLoadedFile = l
                    Case "LastFileLoadedOrSavedByUser" : LastFileLoadedOrSavedByUser = l
                    Case "LastIrradianceCoeffsFile" : LastIrradianceCoeffsFile = l
                End Select
            Loop
            f.Close()
        End If
        LimitFormPosition(Form1)
        LimitFormPosition(Form_Info)
        LimitFormPosition(Form_VideoInControls)
    End Sub

    'Private Sub PrepareSaveLoadFolder()
    '    If My.Computer.FileSystem.FileExists(FileName) Then
    '        SaveLoadFolder = File_GetPath(FileName)
    '    End If
    '    If Not FolderExists(SaveLoadFolder) Then
    '        SaveLoadFolder = Application.StartupPath
    '    End If
    'End Sub

    Public Function File_GetPath(ByVal str As String) As String
        Try
            Return IO.Path.GetDirectoryName(str) & "\"
        Catch
            Return str
        End Try
    End Function


    ' ==================================================================================================
    '  SAVE IMAGE
    ' ==================================================================================================
    Public Sub SaveImage(ByVal img As Image, _
                         ByVal filename As String, _
                         ByVal extension As String, _
                         ByVal Quality As Int32)
        ' ---------------------------------------------------------------------
        extension = LCase(extension)
        filename = RemoveExtension(filename)
        filename += "." & extension
        ' ---------------------------------------------------------------------
        If img Is Nothing Then Exit Sub
        Try
            File_Kill(filename)
            If extension = "jpg" Then
                Dim ImageEncoders() As ImageCodecInfo = ImageCodecInfo.GetImageEncoders()
                Dim myEncoder As System.Drawing.Imaging.Encoder = System.Drawing.Imaging.Encoder.Quality
                Dim myEncoderParameters As New EncoderParameters(1)
                Dim myEncoderParameter As New EncoderParameter(myEncoder, Quality)
                myEncoderParameters.Param(0) = myEncoderParameter
                img.Save(filename, ImageEncoders(1), myEncoderParameters)
            Else
                img.Save(filename, ImageFormatFromFileExtension(extension))
            End If
        Catch
            MsgBox("Image save error", MsgBoxStyle.Exclamation)
        End Try
    End Sub

    Private Function ImageFormatFromFileExtension(ByVal extension As String) As ImageFormat
        Select Case LCase(extension)
            Case "jpg" : Return ImageFormat.Jpeg
            Case "png" : Return ImageFormat.Png
            Case "tiff" : Return ImageFormat.Tiff
            Case "exif" : Return ImageFormat.Exif
            Case "emf" : Return ImageFormat.Emf
            Case "wmf" : Return ImageFormat.Wmf
            Case "gif" : Return ImageFormat.Gif
            Case "bmp" : Return ImageFormat.Bmp
                'Case "ico" : Return ImageFormat.Icon
            Case Else : Return ImageFormat.Jpeg
        End Select
    End Function

    Friend Sub SaveImage(ByVal cnt As Control)
        If Form1.PBox_Spectrum.Image Is Nothing Then Exit Sub
        ' ---------------------------------------------------------------------
        If Not FolderExists(Form1.txt_FilePath.Text & "\") Then
            Form1.SelectSaveFolder()
        End If
        ' ---------------------------------------------------------------------
        Form1.txt_FilePath.Text = Trim(Form1.txt_FilePath.Text)
        Form1.txt_FileName.Text = Trim(Form1.txt_FileName.Text)
        ' ---------------------------------------------------------------------
        Dim FilePath As String = Form1.txt_FilePath.Text.Trim
        Form1.txt_FilePath.Text = FilePath
        ' ---------------------------------------------------------------------
        If Not FolderExists(FilePath & "\") Then
            MsgBox("Image save error", MsgBoxStyle.Exclamation)
            Return
        End If
        ' --------------------------------------------------------------------- First Free Index
        Dim FilePathAndName As String
        FilePathAndName = Filename_WithFirstFreeIndex(Form1.txt_FilePath.Text, _
                                                      Form1.txt_FileName.Text, _
                                                      "." + Form1.ComboBox_FileType.Text)
        ' --------------------------------------------------------------------- Save Image
        SaveImage(GetImage(cnt), _
                  FilePathAndName, _
                  Form1.ComboBox_FileType.Text, _
                  100)
        ' 
        ' ---------------------------------------------------------------------
        PlaySound_Success()
    End Sub

    Private Function GetImage(ByVal cnt As Control) As Bitmap
        Dim s As Size = cnt.Size
        Dim bmp As Bitmap = New Bitmap(s.Width, s.Height)
        cnt.DrawToBitmap(bmp, New Rectangle(0, 0, s.Width, s.Height))
        Return bmp
    End Function


    ' ==================================================================================================
    '  SAVE SPECTRUM FILE
    ' ==================================================================================================
    Friend Sub SaveSpectrumFile(ByVal FilePathAndName As String)
        Dim writer As System.IO.StreamWriter
        IO.Directory.CreateDirectory(IO.Path.GetDirectoryName(FilePathAndName))
        writer = My.Computer.FileSystem.OpenTextFileWriter(FilePathAndName, _
                                                           False, _
                                                           New System.Text.UTF8Encoding(False))
        writer.Write(GetSpectrumText())
        writer.Close()

        ' ------------------------------------------------------------------
        LastLoadedFile = IO.Path.GetFileName(FilePathAndName)
        If Not LastLoadedFile.Contains("LastSpectrum") Then
            LastFileLoadedOrSavedByUser = LastLoadedFile
        End If
        ' ------------------------------------------------------------------
    End Sub

    Friend Sub SaveSpectrumToFile_WithIncrementedIndex()
        '
        ' ---------------------------------------------------------------------
        If Not FolderExists(Form1.txt_FilePath.Text & "\") Then
            Form1.SelectSaveFolder()
        End If
        ' ---------------------------------------------------------------------
        Form1.txt_FilePath.Text = Trim(Form1.txt_FilePath.Text)
        Form1.txt_FileName.Text = Trim(Form1.txt_FileName.Text)
        ' ---------------------------------------------------------------------
        Dim FilePath As String = Form1.txt_FilePath.Text.Trim
        Form1.txt_FilePath.Text = FilePath
        ' ---------------------------------------------------------------------
        If Not FolderExists(FilePath & "\") Then
            MsgBox("Data file save error", MsgBoxStyle.Exclamation)
            Return
        End If
        ' ---------------------------------------------------------------------
        Dim FilePathAndName As String
        FilePathAndName = Filename_WithFirstFreeIndex(FilePath, _
                                                      Form1.txt_FileName.Text, _
                                                      "." + SpectrumFileType.ToLower)
        SaveSpectrumFile(FilePathAndName)
        ' 
        ' ---------------------------------------------------------------------
        PlaySound_Success()
    End Sub

    Friend Function Filename_WithFirstFreeIndex(ByVal path As String, _
                                                ByVal name As String, _
                                                ByVal ext As String) As String
        Dim index As Int32 = 1
        Dim completeFileName As String
        '
        Do
            completeFileName = path + "\" + name + "_" + index.ToString("000") + ext
            index += 1
        Loop Until Not IO.File.Exists(completeFileName)
        '
        Return completeFileName
    End Function

    ' ======================================================================================
    '  LOAD SPECTRUM FILE
    ' ======================================================================================
    Friend Sub LoadSpectrumFileDialog()
        ' ---------------------------------------------------------------------
        If Not FolderExists(Form1.txt_FilePath.Text & "\") Then
            Form1.SelectSaveFolder()
        End If
        ' ---------------------------------------------------------------------
        Form1.txt_FilePath.Text = Trim(Form1.txt_FilePath.Text)
        Form1.txt_FileName.Text = Trim(Form1.txt_FileName.Text)
        ' ---------------------------------------------------------------------
        Dim FilePath As String = Form1.txt_FilePath.Text.Trim
        Form1.txt_FilePath.Text = FilePath
        ' ---------------------------------------------------------------------
        If Not FolderExists(FilePath & "\") Then
            MsgBox("Folder not found", MsgBoxStyle.Exclamation)
            Return
        End If
        ' ---------------------------------------------------------------------
        Dim ofd As OpenFileDialog = New OpenFileDialog()
        ofd.InitialDirectory = Form1.txt_FilePath.Text
        ofd.Multiselect = True
        ofd.Filter = "Spectrum file (*.txt;*.csv)|*txt;*.csv"
        ofd.DefaultExt = ".txt"
        'IO.Directory.CreateDirectory(ofd.InitialDirectory)
        '
        ' --------------------------------------------------------------------- SELECT FILE IN THE LIST
        ofd.FileName = LastFileLoadedOrSavedByUser
        SelectFileWithSendKeys(ofd.FileName, ofd.InitialDirectory)
        '
        If ofd.ShowDialog() = Windows.Forms.DialogResult.OK Then
            LoadSpectrumFile(ofd.FileName)
        End If
    End Sub

    Friend Sub LoadSpectrumFile(ByVal FilePathAndName As String)
        If Not IO.File.Exists(FilePathAndName) Then
            FilePathAndName = Form1.txt_FilePath.Text + "\" + IO.Path.GetFileName(FilePathAndName)
        End If
        If Not IO.File.Exists(FilePathAndName) Then
            FilePathAndName += ".txt"
        End If
        If Not IO.File.Exists(FilePathAndName) Then
            FilePathAndName = FilePathAndName.Replace(".txt", ".csv")
        End If
        If Not IO.File.Exists(FilePathAndName) Then Return
        Spectrometer_SetSpectrumTextFromFile(FilePathAndName)
        ' ------------------------------------------------------------------
        LastLoadedFile = IO.Path.GetFileName(FilePathAndName)
        If Not LastLoadedFile.Contains("LastSpectrum") Then
            LastFileLoadedOrSavedByUser = LastLoadedFile
        End If
        ' ------------------------------------------------------------------
        Form1.Text = AppTitleAndVersion() + " - " + LastLoadedFile
        ResetClipBoardData()
    End Sub

    ' ======================================================================================
    '  SAVE LOAD LAST SPECTRUM FILE
    ' ======================================================================================
    Friend Sub SaveLastSpectrum()
        SaveSpectrumFile(Application.StartupPath + "\Files\LastSettings\LastSpectrum.txt")
    End Sub

    Friend Sub LoadLastSpectrum()
        LoadSpectrumFile(Application.StartupPath + "\Files\LastSettings\LastSpectrum.txt")
    End Sub


    ' ======================================================================================
    '  SAVE LOAD CLIBRATION
    ' ======================================================================================
    Friend LastCalibrationFile As String

    Friend Sub SaveCalibration(ByVal FilePathAndName As String)
        If FilePathAndName = "" Then
            FilePathAndName = Application.StartupPath + "\Files\LastSettings\LastCalibration.txt"
        End If
        Dim s As String = ""
        s += (TabString("CalibrationBins", CalibrationBinsToString_Normalized())) + vbCrLf
        s += (TabString("CalibrationNanometers", CalibrationNanometersToString()))
        IO.File.WriteAllText(FilePathAndName, s)
        If Not FilePathAndName.Contains("LastCalibration") Then
            LastCalibrationFile = FilePathAndName
        End If
    End Sub
    Friend Sub LoadCalibration(ByVal FilePathAndName As String)
        If Not IO.File.Exists(FilePathAndName) Then
            FilePathAndName = Application.StartupPath + "\Files\LastSettings\LastCalibration.txt"
        End If
        If Not IO.File.Exists(FilePathAndName) Then Return
        Dim sa() As String = IO.File.ReadAllLines(FilePathAndName)
        If sa.Length = 2 Then
            For Each l As String In sa
                Select Case ExtractParamName(l)
                    Case "CalibrationBins" : CalibrationBinsFromString_Normalized(l)
                    Case "CalibrationNanometers" : CalibrationNanometersFromString(l)
                End Select
            Next
            If Not FilePathAndName.Contains("LastCalibration") Then
                LastCalibrationFile = FilePathAndName
            End If
            Spectrometer_SetSourceParams()
            Spectrometer_RedrawSamples()
        End If
    End Sub

    Friend Sub SaveCalibrationDialog()
        Dim sfd As SaveFileDialog = New SaveFileDialog()
        sfd.InitialDirectory = Application.StartupPath + "\Files\"
        sfd.DefaultExt = ".txt"
        sfd.AddExtension = True
        sfd.FileName = IO.Path.GetFileName(LastCalibrationFile)
        sfd.Filter = "Calibration file (*.txt)|*txt"
        ' --------------------------------------------------------------------- SELECT FILE IN THE LIST
        SelectFileWithSendKeys(sfd.FileName, sfd.InitialDirectory)
        IO.Directory.CreateDirectory(sfd.InitialDirectory)
        If sfd.ShowDialog() = Windows.Forms.DialogResult.OK Then
            SaveCalibration(sfd.FileName)
        End If
    End Sub

    Friend Sub LoadCalibrationDialog()
        ' ---------------------------------------------------------------------
        Dim FilePath As String = Application.StartupPath + "\Files"
        ' ---------------------------------------------------------------------
        If Not FolderExists(FilePath & "\") Then
            MsgBox("Folder not found", MsgBoxStyle.Exclamation)
            Return
        End If
        ' ---------------------------------------------------------------------
        Dim ofd As OpenFileDialog = New OpenFileDialog()
        ofd.InitialDirectory = FilePath
        ofd.Multiselect = True
        ofd.Filter = "Calibration file (*.txt)|*txt"
        ofd.DefaultExt = ".txt"
        ofd.FileName = IO.Path.GetFileName(LastCalibrationFile)
        ' --------------------------------------------------------------------- SELECT FILE IN THE LIST
        SelectFileWithSendKeys(ofd.FileName, ofd.InitialDirectory)
        ' ---------------------------------------------------------------------
        If ofd.ShowDialog() = Windows.Forms.DialogResult.OK Then
            LoadCalibration(ofd.FileName)
            SaveCalibration("")
        End If
    End Sub

    ' TODO IRRADIANCE 3
    ' ======================================================================================
    '  SAVE LOAD IRRADIANCE-COEFFS
    ' ======================================================================================
    Friend LastIrradianceCoeffsFile As String

    Friend Sub LoadIrradianceCoeffs()
        If Not IO.File.Exists(LastIrradianceCoeffsFile) Then
            LastIrradianceCoeffsFile = Application.StartupPath + "\Files\IrradianceCoeffs\Coeffs_FLAT.txt"
        End If
        If Not IO.File.Exists(LastIrradianceCoeffsFile) Then
            IO.Directory.CreateDirectory(Application.StartupPath + "\Files\IrradianceCoeffs")
            Dim s As String = ""
            s += "--------------" + vbCrLf
            s += " nm   Coeffs  " + vbCrLf
            s += "--------------" + vbCrLf
            s += "400    1.0" + vbCrLf
            s += "800    1.0" + vbCrLf
            IO.File.WriteAllText(LastIrradianceCoeffsFile, s)
        End If
        Dim sa() As String = IO.File.ReadAllLines(LastIrradianceCoeffsFile)
        Dim nm_old As Double = 0
        Dim nm As Double = 0
        Dim coeff As Double = 0
        ReDim Irradiance_Nanometers(-1)
        ReDim Irradiance_Coefficents(-1)
        For Each l As String In sa
            l = ReplaceMultipleSpacesAndTabAndTrim(l)
            Dim sa2() As String = l.Split(" "c)
            If sa2.Length = 2 Then
                nm = Val(sa2(0).Replace(",", "."))
                coeff = Val(sa2(1).Replace(",", "."))
                If nm > 10 And nm < 10000 And coeff > 0 Then
                    If nm <= nm_old Then
                        MessageBox.Show("Error reading the coefficients file." + vbCrLf + vbCrLf + _
                                        "Nanometers are not in ascending order.", _
                                        "Theremino Spectrometer", MessageBoxButtons.OK)
                        ReDim Irradiance_Nanometers(-1)
                        ReDim Irradiance_Coefficents(-1)
                        Return
                    End If
                    nm_old = nm
                    Dim len As Int32 = Irradiance_Nanometers.Length
                    ReDim Preserve Irradiance_Nanometers(len)
                    ReDim Preserve Irradiance_Coefficents(len)
                    Irradiance_Nanometers(len) = nm
                    Irradiance_Coefficents(len) = coeff
                End If
            End If
        Next
        If Irradiance_Nanometers.Length < 2 Then
            MessageBox.Show("Error reading the coefficients file." + vbCrLf + vbCrLf + _
                            "Nanometer and coefficient lines are less then two.", _
                            "Theremino Spectrometer", MessageBoxButtons.OK)
            ReDim Irradiance_Nanometers(-1)
            ReDim Irradiance_Coefficents(-1)
        End If
    End Sub

    Friend Sub LoadIrradianceCoeffsDialog()
        ' ---------------------------------------------------------------------
        Dim FilePath As String = Application.StartupPath + "\Files\IrradianceCoeffs"
        ' ---------------------------------------------------------------------
        If Not FolderExists(FilePath & "\") Then
            MsgBox("Folder not found", MsgBoxStyle.Exclamation)
            Return
        End If
        ' ---------------------------------------------------------------------
        Dim ofd As OpenFileDialog = New OpenFileDialog()
        ofd.InitialDirectory = FilePath
        ofd.Multiselect = True
        ofd.Filter = "Irradiance coeffs file (*.txt)|*txt"
        ofd.DefaultExt = ".txt"
        ofd.FileName = IO.Path.GetFileName(LastIrradianceCoeffsFile)
        ' --------------------------------------------------------------------- SELECT FILE IN THE LIST
        SelectFileWithSendKeys(ofd.FileName, ofd.InitialDirectory)
        ' ---------------------------------------------------------------------
        If ofd.ShowDialog() = Windows.Forms.DialogResult.OK Then
            LastIrradianceCoeffsFile = ofd.FileName
            LoadIrradianceCoeffs()
            Spectrometer_RedrawSamples()
        End If
    End Sub

    Friend Sub EditIrradianceCoeffs()
        If Not IO.File.Exists(LastIrradianceCoeffsFile) Then Return
        Process.Start(Application.StartupPath + "\Files\IrradianceCoeffs")
    End Sub

End Module
