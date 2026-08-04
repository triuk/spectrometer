Module Module_TextCommands

    ' ===============================================================================================================
    '  TEXT COMMAND SLOT and WRITE RESPONSES 
    ' ===============================================================================================================
    Friend CommandSlotText As Int32 = 31
    Friend ResponseSlotText As Int32 = 32

    Friend Sub EnsureSafeValueToTextSlots()
        StringSlots.WriteString(CommandSlotText, "")
        StringSlots.WriteString(ResponseSlotText, "")
    End Sub

    Private PollCommandSlotSyncLock As Object = New Object
    Private TextCommand As String
    Private TextCommandLowerCase As String
    Private TextCommandParameters As String
    Private ResponseString As String

    Friend Sub PollTextCommandsSlot()
        If CommandSlotText >= 0 Then
            SyncLock PollCommandSlotSyncLock
                ResponseString = "OK"
                TextCommand = StringSlots.ReadString(CommandSlotText)
                If TextCommand <> "" Then
                    StringSlots.WriteString(ResponseSlotText, "WORKING")
                    ' -------------------------------------------------------------- remove spaces and comments
                    RemoveComments(TextCommand)
                    TextCommand = ReplaceMultipleSpacesAndTabAndTrim(TextCommand)
                    ' -------------------------------------------------------------- 
                    'TextCommandFirstWord = TextCommand.Replace(vbTab, " ").Split(" "c)(0)
                    TextCommandParameters = RemoveFirstWord(TextCommand)
                    ' -------------------------------------------------------------- prepare lower case
                    TextCommandLowerCase = TextCommand.ToLower
                    ' -------------------------------------------------------------- split line
                    Dim sa() As String = TextCommandLowerCase.Split(" "c)
                    If sa.Length = 0 Then Return
                    ' -------------------------------------------------------------- extract params
                    Dim n(9) As Double
                    If sa.Length < n.Length Then
                        For i As Int32 = 1 To n.Length - 1
                            If i < sa.Length Then
                                n(i) = CDbl(Val(sa(i)))
                            End If
                        Next
                    End If
                    ' ------------------------------------------------------------------ COMMANDS
                    Select Case sa(0)
                        ' TODO Commands for LoadIrradianceFile
                        ' -------------------------------------------------------------- MENU
                        Case "loadspectrumfile"
                            LoadSpectrumFile(TextCommandParameters)
                        Case "loadcalibrationfile"
                            Dim f As String = Application.StartupPath + "\Files\" + TextCommandParameters
                            If IO.File.Exists(f) Then
                                LoadCalibration(f)
                            End If
                        Case "loadirradiancefile"
                            Dim f As String = Application.StartupPath + "\Files\IrradianceCoeffs\" + TextCommandParameters
                            If IO.File.Exists(f) Then
                                LastIrradianceCoeffsFile = f
                                LoadIrradianceCoeffs()
                            End If
                            LoadSpectrumFile(TextCommandParameters)
                        Case "sensortype"
                            Select Case TextCommandParameters.ToUpper
                                Case "WEBCAM"
                                    SENSOR_Type = SensorTypes.WebCam
                                    Form1.InitSensorType()
                                Case "TCD1304"
                                    SENSOR_Type = SensorTypes.TCD1304
                                    Form1.InitSensorType()
                                Case "TCD1254"
                                    SENSOR_Type = SensorTypes.TCD1254
                                    Form1.InitSensorType()
                            End Select
                            ' ---------------------------------------------------------- TOOLBAR
                        Case "savespectrumimage"
                            SaveImage(Form1.PBox_Spectrum)
                        Case "savetotalimage"
                            SaveImage(Form1)
                            '
                        Case "writedataon"
                            Form1.Tools_SaveDataFile.CheckState = CheckState.Checked
                        Case "writedataoff"
                            Form1.Tools_SaveDataFile.CheckState = CheckState.Unchecked
                        Case "writedatatime"
                            SetToolComboByText(Form1.Cmb_SaveTime, TextCommandParameters)
                        Case "writedatarepeaton"
                            Form1.Tools_Repeat.CheckState = CheckState.Checked
                        Case "writedatarepeatoff"
                            Form1.Tools_Repeat.CheckState = CheckState.Unchecked
                            '
                        Case "optionson"
                            Form1.Tools_Options.CheckState = CheckState.Checked
                        Case "optionsoff"
                            Form1.Tools_Options.CheckState = CheckState.Unchecked
                            ' ------------------------------------------------------ SERIAL PORT
                        Case "comport"
                            Form1.ComboComPort_AddItems()
                            SetComboByText(Form1.cmb_ComPort, TextCommandParameters)
                        Case "bauds"
                            SetComboByText(Form1.Cmb_ComSpeed, TextCommandParameters)
                        Case "comconnect"
                            Form1.OpenComm()
                        Case "comdisconnect"
                            Form1.CloseComm()
                        Case "autoexpon"
                            AutoExposureEnabled = True
                            Form1.UpdateAutoexposureButton()
                        Case "autoexpoff"
                            AutoExposureEnabled = False
                            Form1.UpdateAutoexposureButton()
                        Case "exposure"
                            SetComboByText(Form1.Cmb_ExposureTime, TextCommandParameters)
                            '
                            ' ------------------------------------------------------ SENSOR
                        Case "samples"
                            SetComboByText(Form1.Cmb_Resolution, TextCommandParameters)
                        Case "adcspeed"
                            SetComboByText(Form1.Cmb_AdcSpeed, TextCommandParameters)
                        Case "mode"
                            SetComboByText(Form1.Cmb_DebugType, TextCommandParameters)
                        Case "adcscale"
                            SetComboByText(Form1.Cmb_Scale, TextCommandParameters)
                            '
                            ' ------------------------------------------------------ WEBCAM
                        Case "webcamindex"
                            Form1.ComboBox_VideoInputDevice_FillWithDevices()
                            Combo_SetIndex(Form1.ComboBox_VideoInputDevice, CInt(Val(TextCommandParameters)))
                        Case "webcamconnect"
                            Form1.OpenWebCam()
                        Case "webcamdisconnect"
                            Form1.CloseWebCam()
                        Case "videoincontrolson"
                            Form1.OpenFormVideoInControls()
                        Case "videoincontrolsoff"
                            Form1.CloseFormVideoInControls()
                            '
                            ' ------------------------------------------------------ FILES 
                        Case "filename"
                            Form1.txt_FileName.Text = TextCommandParameters
                        Case "imagetype"
                            Form1.FillComboFileType()
                            SetComboByText(Form1.ComboBox_FileType, TextCommandParameters)
                        Case "filepath"
                            Form1.txt_FilePath.Text = TextCommandParameters
                            '
                            ' ------------------------------------------------------ FILTERS
                        Case "averageon"
                            AverageEnabled = True
                            Form1.AverageStart()
                            Form1.UpdateAverageLabel()
                        Case "averageoff"
                            AverageEnabled = False
                            Form1.AverageStart()
                            Form1.UpdateAverageLabel()
                        Case "average"
                            SetComboByText(Form1.Cmb_Average, TextCommandParameters)
                        Case "spatialfilter"
                            SetNumericValueInteger(Form1.txt_SpatialAveraging, CInt(n(1)))
                        Case "reference_on"
                            Form1.btn_Reference.Checked = True
                            Spectrometer_SetReference()
                        Case "reference_off"
                            Form1.btn_Reference.Checked = False
                            Spectrometer_ResetReference()
                        Case "background_on"
                            Form1.btn_Background.Checked = True
                            Spectrometer_SetBackground()
                        Case "background_off"
                            Form1.btn_Background.Checked = False
                            Spectrometer_ResetBackground()
                        Case "risingspeed"
                            Form1.txt_RisingSpeed.Text = Int(n(1)).ToString
                        Case "fallingspeed"
                            Form1.txt_FallingSpeed.Text = Int(n(1)).ToString
                        Case "resetspectrumdata"
                            Spectrometer_ResetAllData()
                            '    
                            ' ------------------------------------------------------ SENSOR SAMPLES 
                        Case "adcmax"
                            SetNumericValueInteger(Form1.txt_AdcMax, CInt(n(1)))
                        Case "adcmin"
                            SetNumericValueInteger(Form1.txt_AdcMin, CInt(n(1)))
                        Case "adcminauto_on"
                            Form1.chk_AdcMinAuto.Checked = True
                        Case "adcminauto_off"
                            Form1.chk_AdcMinAuto.Checked = False
                        Case "startx"
                            SetNumericValueInteger(Form1.txt_StartX, CInt(n(1)))
                        Case "endx"
                            SetNumericValueInteger(Form1.txt_EndX, CInt(n(1)))
                        Case "sizey"
                            SetNumericValueInteger(Form1.txt_SizeY, CInt(n(1)))
                        Case "starty"
                            SetNumericValueInteger(Form1.txt_StartY, CInt(n(1)))
                        Case "fliph_on"
                            Form1.chk_FlipH.Checked = True
                        Case "fliph_off"
                            Form1.chk_FlipH.Checked = False
                        Case "flipv_on"
                            Form1.chk_FlipV.Checked = True
                        Case "flipv_off"
                            Form1.chk_FlipV.Checked = False
                            '        
                            ' ------------------------------------------------------ STATUS BAR
                        Case "logscale"
                            SetNumericValueInteger(Form1.txt_LogScale, CInt(n(1)))
                        Case "dips_on"
                            Form1.btn_Dips.Checked = True
                            Spectrometer_SetRunningModeParams()
                            ShowSpectrumGraph()
                        Case "dips_off"
                            Form1.btn_Dips.Checked = False
                            Spectrometer_SetRunningModeParams()
                            ShowSpectrumGraph()
                        Case "peaks_on"
                            Form1.btn_Peaks.Checked = True
                            Spectrometer_SetRunningModeParams()
                            ShowSpectrumGraph()
                        Case "peaks_off"
                            Form1.btn_Peaks.Checked = False
                            Spectrometer_SetRunningModeParams()
                            ShowSpectrumGraph()
                        Case "colors_on"
                            Form1.btn_Colors.Checked = True
                            Spectrometer_SetRunningModeParams()
                            ShowSpectrumGraph()
                        Case "colors_off"
                            Form1.btn_Colors.Checked = False
                            Spectrometer_SetRunningModeParams()
                            ShowSpectrumGraph()
                        Case "trimscale_on"
                            Form1.btn_TrimScale.Checked = True
                            Spectrometer_SetRunningModeParams()
                            Spectrometer_RedrawSamples()
                        Case "trimscale_off"
                            Form1.btn_TrimScale.Checked = False
                            Spectrometer_SetRunningModeParams()
                            Spectrometer_RedrawSamples()
                            '
                            ' ------------------------------------------------------ Error
                        Case Else
                            SetError("Command not recognized: " + TextCommand)
                    End Select
                    ' -------------------------------------------------------------- UPDATE RESPONSE
                    StringSlots.WriteString(CommandSlotText, "")
                    If ResponseSlotText >= 0 Then
                        StringSlots.WriteString(ResponseSlotText, ResponseString)
                    End If
                End If
            End SyncLock
        End If
    End Sub

    Private Sub SetError(ByVal err As String)
        ResponseString = err
        Console.Beep(660, 50)
        Console.Beep(440, 50)
        Console.Beep(220, 150)
    End Sub

    ' ==============================================================================================================
    '   USEFUL FUNCTIONS
    ' ==============================================================================================================
    Private Sub SetCheckButton(ByVal btn As ToolStripButton, ByVal check As String)
        If btn.Enabled And btn.Visible Then
            btn.Checked = check <> "off" And check <> "0"
        Else
            SetError("Option not enabled: " + TextCommand)
        End If
    End Sub

    Private Sub SetCheckButton(ByVal btn As CustomControlsLib.MyButton, ByVal check As String)
        If btn.Enabled And btn.Visible Then
            btn.Checked = check <> "off" And check <> "0"
        Else
            SetError("Option not enabled: " + TextCommand)
        End If
    End Sub

    Private Sub SetCheckBox(ByVal chk As CheckBox, ByVal check As String)
        If chk.Enabled And chk.Visible Then
            chk.Checked = check <> "off" And check <> "0"
        Else
            SetError("Option not enabled: " + TextCommand)
        End If
    End Sub

    Private Sub SetNumericValueInteger(ByVal txt As CustomControlsLib.MyTextBox, ByVal value As Int32)
        If txt.Enabled And txt.Visible Then
            txt.NumericValueInteger = value
            If txt.NumericValueInteger <> value Then
                SetError("The " + txt.Name + "value has been limited to: " + txt.NumericValueInteger.ToString)
            End If
        Else
            SetError("Option not enabled: " + txt.Name)
        End If
    End Sub

    Private Sub SetNumericValueFloat(ByVal txt As CustomControlsLib.MyTextBox, ByVal value As Double)
        If txt.Enabled And txt.Visible Then
            txt.NumericValue = value
            If txt.NumericValue <> value Then
                SetError("The " + txt.Name + "value has been limited to: " + txt.NumericValue.ToString)
            End If
        Else
            SetError("Option not enabled: " + txt.Name)
        End If
    End Sub

    Private Sub SetComboByText(ByVal cmb As ComboBox, ByVal txt As String)
        For i As Int32 = 0 To cmb.Items.Count - 1
            If CompareLettersAndDigits(cmb.Items(i).ToString, txt) Then
                txt = cmb.Items(i).ToString
                cmb.SelectedIndex = i
                cmb.Refresh()
                Return
            End If
        Next
        SetError("Command not valid: " + TextCommand)
    End Sub

    Private Sub SetToolComboByText(ByVal cmb As ToolStripComboBox, ByVal txt As String)
        For i As Int32 = 0 To cmb.Items.Count - 1
            If CompareLettersAndDigits(cmb.Items(i).ToString, txt) Then
                txt = cmb.Items(i).ToString
                cmb.SelectedIndex = i
                'cmb.Refresh()
                Return
            End If
        Next
        SetError("Command not valid: " + TextCommand)
    End Sub

    Private Function CompareLettersAndDigits(ByVal s1 As String, ByVal s2 As String) As Boolean
        s1 = LettersOrDigitsOnly(s1).ToLower
        s2 = LettersOrDigitsOnly(s2).ToLower
        Return s1 = s2
    End Function

    Private Function LettersOrDigitsOnly(ByVal str As String) As String
        Dim result As String = ""
        For Each c As Char In str
            If Char.IsLetterOrDigit(c) Or c = "."c Then
                result += c
            End If
        Next
        Return result
    End Function

End Module
