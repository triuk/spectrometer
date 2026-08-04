
Public Class Form1

    Private Sub Form1_Load(ByVal sender As Object, ByVal e As System.EventArgs) Handles Me.Load
        ' ----------------------------------------------------------------
        Me.Text = AppTitleAndVersion()
        ' ---------------------------------------------------------------- 
        EventsAreEnabled = False
        ComboComPort_AddItems()
        Cmb_ComSpeed.Text = "1000000"
        Cmb_Resolution.SelectedIndex = 0
        Cmb_AdcSpeed.SelectedIndex = 0
        Cmb_ExposureTime.SelectedIndex = Cmb_ExposureTime.Items.Count - 1
        Cmb_Average.SelectedIndex = Cmb_Average.Items.Count - 1
        Cmb_DebugType.SelectedIndex = 0
        Cmb_Scale.SelectedIndex = 6
        Cmb_SaveTime.SelectedIndex = 0
        DestPbox = Me.PBox_Spectrum
        Load_INI()
        ' ---------------------------------------------------------------- VIDEO IN DEVICE
        ComboBox_VideoInputDevice_InitWithCurrentDeviceName()
        ' ---------------------------------------------------------------- DOCK WINDOWS
        Form_Info.Location = New Point(FormInfo_Left, FormInfo_Top)
        Form_Info.Size = New Size(FormInfo_Width, FormInfo_Height)
        If FormInfo_VisibleAtStart Then
            Form_Info.Show(Me)
        Else
            Form_Info.Show(Me)
            Form_Info.Visible = False
            Tools_Info.Checked = False
        End If
        If ConnectedAtStart Then
            If Form_VideoInControls_VisibleAtStart Then
                Form_VideoInControls.Show(Me)
            Else
                Form_VideoInControls.Show(Me)
                Form_VideoInControls.Visible = False
            End If
            DockAllWindows()
            If SENSOR_Type = SensorTypes.WebCam Then
                OpenWebCam()
            Else
                OpenComm()
            End If
        End If

        ' ---------------------------------------------------------------
        If txt_FileName.Text = "" Then
            txt_FileName.Text = "Test1"
        End If
        If txt_FilePath.Text = "" Then
            txt_FilePath.Text = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)
        End If
        ' ---------------------------------------------------------------
        UpdateSensorTypePanels()
        ShowHideOptions()
        UpdateComButton()
        UpdateWebCamButton()
        ' ---------------------------------------------------------------
        Menu_Tools_SensorType_UpdateChecks()
        Menu_Tools_Separator_UpdateChecks()
        Menu_Tools_FileType_UpdateChecks()
        Spectrometer_SetRunningModeParams()
        ComboBox_FileFormat_InitWithCurrentFileFormat()
        SetLocales()
        UpdateUserInterface()
        EnsureSafeValueToTextSlots()
        ' ----------------------------------------------------------------
        ToolStrip1.Renderer = New ToolStripButtonRenderer
        ' ----------------------------------------------------------------
        MillisecondPrecision_Start()
        ' ---------------------------------------------------------------- Main Timer
        Timer1.Interval = 10
        Timer1.Start()
        ' ---------------------------------------------------------------- Timer 10Hz
        Timer_10Hz.Interval = 100
        Timer_10Hz.Start()
        ' ----------------------------------------------------------------
        SetDefaultFocus()
        ' ---------------------------------------------------------------- SHOW
        Refresh()
        Forms_FadeTo(1, 400)
        ' ---------------------------------------------------------------- 
        EventsAreEnabled = True
        ' ----------------------------------------------------------------
        If Not COM_IsOpen() And Not WebCamIsWorking Then
            ' ------------------------------------------------------------ LOAD CALIBRATION
            LoadCalibration("")
            ' ------------------------------------------------------------ LOAD LAST SPECTRUM
            LoadLastSpectrumFile()
        End If
        ' ---------------------------------------------------------------- LOAD IRRADIANCE COEFFS
        LoadIrradianceCoeffs()
    End Sub

    Private Sub Form1_FormClosing(ByVal sender As Object, ByVal e As System.Windows.Forms.FormClosingEventArgs) Handles Me.FormClosing
        If Not EventsAreEnabled Then Return
        MillisecondPrecision_End()
        SaveLastSpectrum()
        CloseProgram()
    End Sub

    Private Sub CloseProgram()
        Save_INI()
        Form_Info.Close()
        EventsAreEnabled = False
        Forms_FadeTo(0, 500)
        Me.Refresh()
        Timer1.Stop()
        Capture_STOP()
        Form_VideoInControls.Close()
        Me.Close()
    End Sub

    Private Sub Form1_LocationChanged(ByVal sender As Object, ByVal e As System.EventArgs) Handles Me.LocationChanged
        If Not EventsAreEnabled Then Return
        LimitFormPosition(Me)
    End Sub

    Private Sub Form_Main_Resize(ByVal sender As Object, ByVal e As System.EventArgs) Handles Me.Resize
        If Not EventsAreEnabled Then Return
        If Me.WindowState = FormWindowState.Minimized Then
            Form_VideoInControls.WindowState = FormWindowState.Minimized
            Form_Info.WindowState = FormWindowState.Minimized
        Else
            Form_VideoInControls.WindowState = FormWindowState.Normal
            Form_Info.WindowState = FormWindowState.Normal
        End If
        DockAllWindows()
        ShowHideOptions()
        Spectrometer_RedrawSamples()
    End Sub

    Private Sub Form_Main_Move(ByVal sender As Object, ByVal e As System.EventArgs) Handles Me.Move
        If Not EventsAreEnabled Then Return
        DockAllWindows()
    End Sub

    Private Sub SetDefaultFocus()
        PBox_Samples.Focus()
    End Sub

    ' --------------------------------------------------------------------
    '  Correct the risk to change the StartY and SizeY values
    ' --------------------------------------------------------------------
    Private Sub Form1_MouseEnter(ByVal sender As Object, ByVal e As System.EventArgs) Handles Me.MouseEnter
        SetDefaultFocus()
    End Sub
    'Private Sub txt_SizeY_MouseLeave(ByVal sender As Object, ByVal e As System.EventArgs) Handles txt_SizeY.MouseLeave
    '    SetDefaultFocus()
    'End Sub
    'Private Sub txt_StartY_MouseLeave(ByVal sender As Object, ByVal e As System.EventArgs) Handles txt_StartY.MouseLeave
    '    SetDefaultFocus()
    'End Sub
    ' --------------------------------------------------------------------

    Friend Sub PictureBox1_Clear()
        PBox_Samples.Image = PBox_Samples.InitialImage
    End Sub

    Friend Sub DockAllWindows()
        Form_VideoInControls.SetSnap()
        Form_VideoInControls.TopMost = True
        Form_Info.SetSnap()
        Form_Info.TopMost = True
    End Sub

    Friend Sub OpenFormVideoInControls()
        Form_VideoInControls.Visible = True
        DockAllWindows()
    End Sub

    Friend Sub CloseFormVideoInControls()
        Form_VideoInControls.Visible = False
        DockAllWindows()
    End Sub

    Private Sub OpenCloseFormVideoInControls()
        If Form_VideoInControls.Visible Then
            Form_VideoInControls.Visible = False
        Else
            Form_VideoInControls.Visible = True
            Form_VideoInControls.Opacity = 1
            Me.Focus()
        End If
        DockAllWindows()
    End Sub

    Private Sub UpdateUserInterface()
        UpdateAutoexposureButton()
        UpdateAverageLabel()
        UpdateComButton()
        UpdateWebCamButton()
        Refresh()
    End Sub

    Private Sub Btn_VideoInControls_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Btn_VideoInControls.Click
        OpenCloseFormVideoInControls()
    End Sub

    ' =========================================================================
    '  ShowHideOptions and UpdateSensorTypePanels
    ' =========================================================================
    Private Sub ShowHideOptions()
        If Tools_Options.Checked Then
            GroupBox_SaveImage.Visible = True
            GroupBox_Input.Visible = True
            If SENSOR_Type = SensorTypes.WebCam Then
                GroupBox_VideoInOptions.Visible = True
                GroupBox_Sensor.Visible = False
            Else
                GroupBox_VideoInOptions.Visible = False
                GroupBox_Sensor.Visible = True
            End If
            PBox_Spectrum.Top = GroupBox_Input.Bottom + 8
            PBox_Spectrum.Height = StatusStrip1.Top - 8 - PBox_Spectrum.Top
        Else
            GroupBox_SaveImage.Visible = False
            GroupBox_Input.Visible = False
            GroupBox_VideoInOptions.Visible = False
            GroupBox_Sensor.Visible = False
            PBox_Spectrum.Top = GroupBox_Filters.Bottom + 8
            PBox_Spectrum.Height = StatusStrip1.Top - 8 - PBox_Spectrum.Top
            PBox_Spectrum.BringToFront()
        End If
        PBox_Spectrum.Width = Me.Width - 32 ' ensure correct width when closed and reopened minimized
    End Sub

    Private Sub UpdateSensorTypePanels()
        Select Case SENSOR_Type
            Case SensorTypes.WebCam
                COM_Close()
                '
                GroupBox_VideoInDevice.Location = GroupBox_Serial.Location
                GroupBox_VideoInDevice.Height = GroupBox_Serial.Height
                GroupBox_VideoInOptions.Location = GroupBox_Sensor.Location
                GroupBox_VideoInOptions.Height = GroupBox_Sensor.Height
                Label_SizeY.Location = Label_AdcMax.Location
                Label_StartY.Location = Label_AdcMin.Location
                txt_SizeY.Location = txt_AdcMax.Location
                txt_StartY.Location = txt_AdcMin.Location
                '
                PBox_Samples.BackColor = Color.DimGray
                PBox_Samples.Image = Nothing
                GroupBox_Serial.Visible = False
                GroupBox_Sensor.Visible = False
                GroupBox_VideoInDevice.Visible = True
                Label_SizeY.Visible = True
                Label_StartY.Visible = True
                txt_SizeY.Visible = True
                txt_StartY.Visible = True
                Label_AdcMax.Visible = False
                Label_AdcMin.Visible = False
                txt_AdcMax.Visible = False
                txt_AdcMin.Visible = False
                chk_AdcMinAuto.Visible = False
                chk_FlipV.Visible = False
            Case Else
                Capture_STOP()
                CloseFormVideoInControls()
                PBox_Samples.Image = Nothing
                '
                PBox_Samples.BackColor = Color.WhiteSmoke
                GroupBox_Serial.Visible = True
                GroupBox_Sensor.Visible = True
                GroupBox_VideoInDevice.Visible = False
                Label_SizeY.Visible = False
                Label_StartY.Visible = False
                txt_SizeY.Visible = False
                txt_StartY.Visible = False
                Label_AdcMax.Visible = True
                Label_AdcMin.Visible = True
                txt_AdcMax.Visible = True
                txt_AdcMin.Visible = True
                chk_AdcMinAuto.Visible = True
                chk_FlipV.Visible = True
        End Select
    End Sub


    ' ===================================================================================
    '   MenuStrip and ToolStrip Gradients
    ' ===================================================================================
    Private Sub MenuStrip1_Paint(ByVal sender As Object, ByVal e As System.Windows.Forms.PaintEventArgs) Handles MenuStrip1.Paint
        Dim bounds As New Rectangle(0, 0, _
                                    MenuStrip1.Width, MenuStrip1.Height)
        Dim brush As New Drawing2D.LinearGradientBrush(bounds, _
                                                       Color.FromArgb(230, 230, 230), _
                                                       Color.FromArgb(200, 200, 200), _
                                                       Drawing2D.LinearGradientMode.Horizontal)
        e.Graphics.FillRectangle(brush, bounds)
    End Sub
    Private Sub ToolStrip1_Paint(ByVal sender As System.Object, ByVal e As System.Windows.Forms.PaintEventArgs) Handles ToolStrip1.Paint
        Dim bounds As New Rectangle(0, 0, _
                                    ToolStrip1.Width, ToolStrip1.Height)
        Dim brush As New Drawing2D.LinearGradientBrush(bounds, _
                                                       Color.White, _
                                                       Color.FromArgb(200, 200, 200), _
                                                       Drawing2D.LinearGradientMode.Vertical)
        e.Graphics.FillRectangle(brush, bounds)
    End Sub

    ' ===================================================================================
    '   ToolStrip PressedButton color
    ' ===================================================================================
    Class ToolStripButtonRenderer
        Inherits System.Windows.Forms.ToolStripProfessionalRenderer
        Protected Overrides Sub OnRenderButtonBackground(ByVal e As ToolStripItemRenderEventArgs)
            Dim btn As ToolStripButton = CType(e.Item, ToolStripButton)
            If btn IsNot Nothing AndAlso btn.CheckOnClick AndAlso btn.Checked Then
                Dim bounds As Rectangle = New Rectangle(0, 0, e.Item.Width - 1, e.Item.Height - 1)
                Dim brush As New Drawing2D.LinearGradientBrush(bounds, _
                                                               Color.Gold, _
                                                               Color.FromArgb(250, 250, 250), _
                                                               Drawing2D.LinearGradientMode.Vertical)
                e.Graphics.FillRectangle(brush, bounds)
                e.Graphics.DrawRectangle(Pens.Orange, bounds)
            Else
                MyBase.OnRenderButtonBackground(e)
            End If
        End Sub
    End Class

    ' ===================================================================================
    '  MenuStrip and ToolStrip accepting the first click
    '  If the form receives a WM_PARENTNOTIFY (528) message and is not focused 
    '  then the form is activated before to exec the message
    ' ===================================================================================
    <DebuggerStepThrough()> _
    Protected Overrides Sub WndProc(ByRef m As Message)
        If m.Msg = 528 AndAlso Not Me.Focused Then
            Me.Activate()
        End If
        MyBase.WndProc(m)
    End Sub

    ' =======================================================================================
    '   MENU FILE
    ' =======================================================================================
    Private Sub MenuFile_LoadDataFile_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles MenuFile_LoadDataFile.Click
        LoadSpectrumFileDialog()
    End Sub

    Private Sub MenuFile_LoadCalibration_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles MenuFile_LoadCalibration.Click
        LoadCalibrationDialog()
    End Sub
    Private Sub MenuFile_SaveCalibrationAs_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles MenuFile_SaveCalibrationAs.Click
        SaveCalibrationDialog()
    End Sub

    Private Sub MenuFile_LoadIrradianceCoeffs_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles MenuFile_LoadIrradianceCoeffs.Click
        LoadIrradianceCoeffsDialog()
    End Sub
    Private Sub MenuFile_EditIrradianceCoeffs_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles MenuFile_EditIrradianceCoeffs.Click
        EditIrradianceCoeffs()
    End Sub

    Private Sub Menu_Exit_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_File_Exit.Click
        CloseProgram()
    End Sub

    ' =======================================================================================
    '   MENU TOOLS
    ' =======================================================================================
    Private Sub Menu_Tools_SensorType_WebCam_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles Menu_Tools_SensorType_WebCam.Click
        SENSOR_Type = SensorTypes.WebCam
        InitSensorType()
    End Sub
    Private Sub Menu_Tools_SensorType_TCD1304_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles Menu_Tools_SensorType_TCD1304.Click
        SENSOR_Type = SensorTypes.TCD1304
        InitSensorType()
    End Sub
    Private Sub Menu_Tools_SensorType_TCD1254_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles Menu_Tools_SensorType_TCD1254.Click
        SENSOR_Type = SensorTypes.TCD1254
        InitSensorType()
    End Sub
    Private Sub Menu_Tools_SensorType_UpdateChecks()
        Menu_Tools_SensorType_WebCam.Checked = SENSOR_Type = SensorTypes.WebCam
        Menu_Tools_SensorType_TCD1304.Checked = SENSOR_Type = SensorTypes.TCD1304
        Menu_Tools_SensorType_TCD1254.Checked = SENSOR_Type = SensorTypes.TCD1254
    End Sub

    Friend Sub InitSensorType()
        Menu_Tools_SensorType_UpdateChecks()
        UpdateSensorTypePanels()
        ShowHideOptions()
        If SENSOR_Type = SensorTypes.WebCam Then
            OpenWebCam()
        Else
            OpenComm()
        End If
    End Sub

    Private Sub Menu_Tools_Trim1_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_Tools_Trim1.Click
        Calib_BIN = NormalizeArrayTo(New Double() {1000, 2000}, 3600, SENSOR_NumSamples)
        Calib_NM = New Double() {436, 546}
        SaveCalibration("")
        btn_TrimScale.Checked = True
        Spectrometer_SetSourceParams()
        Spectrometer_SetRunningModeParams()
        Spectrometer_ShowReceivedSamples()
        PBox_Samples.Refresh()
        ShowSpectrumGraph()
    End Sub
    Private Sub Menu_Tools_Trim2_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_Tools_Trim2.Click
        Calib_BIN = NormalizeArrayTo(New Double() {1000, 2800}, 3600, SENSOR_NumSamples)
        Calib_NM = New Double() {436, 692}
        SaveCalibration("")
        btn_TrimScale.Checked = True
        Spectrometer_SetSourceParams()
        Spectrometer_SetRunningModeParams()
        Spectrometer_ShowReceivedSamples()
        PBox_Samples.Refresh()
        ShowSpectrumGraph()
    End Sub

    Private Sub Menu_Tools_SeparatorTab_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_Tools_SeparatorTab.Click
        SpectrumFileSeparator = vbTab
        Menu_Tools_Separator_UpdateChecks()
    End Sub
    Private Sub Menu_Tools_SeparatorSemicolon_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_Tools_SeparatorSemicolon.Click
        SpectrumFileSeparator = ";"
        Menu_Tools_Separator_UpdateChecks()
    End Sub
    Private Sub Menu_Tools_SeparatorComma_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_Tools_SeparatorComma.Click
        SpectrumFileSeparator = ","
        Menu_Tools_Separator_UpdateChecks()
    End Sub
    Private Sub Menu_Tools_Separator_UpdateChecks()
        Menu_Tools_SeparatorTab.Checked = SpectrumFileSeparator = vbTab
        Menu_Tools_SeparatorSemicolon.Checked = SpectrumFileSeparator = ";"
        Menu_Tools_SeparatorComma.Checked = SpectrumFileSeparator = ","
    End Sub

    Private Sub Menu_Tools_FileType_TXT_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_Tools_FileType_TXT.Click
        SpectrumFileType = "TXT"
        Menu_Tools_FileType_UpdateChecks()
    End Sub
    Private Sub Menu_Tools_FileType_CSV_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_Tools_FileType_CSV.Click
        SpectrumFileType = "CSV"
        Menu_Tools_FileType_UpdateChecks()
    End Sub
    Private Sub Menu_Tools_FileType_UpdateChecks()
        Menu_Tools_FileType_TXT.Checked = SpectrumFileType = "TXT"
        Menu_Tools_FileType_CSV.Checked = SpectrumFileType = "CSV"
    End Sub

    Private Sub Menu_Tools_SetSlots_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_Tools_SetSlots.Click
        Dim s As String
        Dim t As String = "Theremino Spectrometer - " & Msg_SetSlotsTitle
        s = InputBox(Msg_SlotCommands, t, CommandSlotText.ToString())
        If s <> "" Then CommandSlotText = CInt(Val(s))
        If CommandSlotText < -1 Then CommandSlotText = -1
        If CommandSlotText > 999 Then CommandSlotText = 999
        s = InputBox(Msg_StotResponses, t, ResponseSlotText.ToString())
        If s <> "" Then ResponseSlotText = CInt(Val(s))
        If ResponseSlotText < -1 Then ResponseSlotText = -1
        If ResponseSlotText > 999 Then ResponseSlotText = 999
    End Sub

    ' =======================================================================================
    '   MENU LANGUAGE
    ' =======================================================================================
    Private Sub Menu_Language_DropDownOpening(ByVal sender As Object, ByVal e As System.EventArgs) Handles Menu_Language.DropDownOpening
        For Each item As ToolStripMenuItem In Menu_Language.DropDownItems
            If item.Name.EndsWith(Language, StringComparison.InvariantCultureIgnoreCase) Then
                item.Select()
            End If
        Next
    End Sub
    Private Sub Menu_Language_ENG_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles Menu_Language_ENG.Click
        Language = "ENG"
        SetLocales()
        Save_INI()
        UpdateUserInterface()
    End Sub
    Private Sub Menu_Language_ITA_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles Menu_Language_ITA.Click
        Language = "ITA"
        SetLocales()
        Save_INI()
        UpdateUserInterface()
    End Sub
    Private Sub Menu_Language_FRA_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles Menu_Language_FRA.Click
        Language = "FRA"
        SetLocales()
        Save_INI()
        UpdateUserInterface()
    End Sub
    Private Sub Menu_Language_ESP_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles Menu_Language_ESP.Click
        Language = "ESP"
        SetLocales()
        Save_INI()
        UpdateUserInterface()
    End Sub
    Private Sub Menu_Language_POR_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles Menu_Language_POR.Click
        Language = "POR"
        SetLocales()
        Save_INI()
        UpdateUserInterface()
    End Sub
    Private Sub Menu_Language_DEU_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles Menu_Language_DEU.Click
        Language = "DEU"
        SetLocales()
        Save_INI()
        UpdateUserInterface()
    End Sub
    Private Sub Menu_Language_RUS_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles Menu_Language_RUS.Click
        Language = "RUS"
        SetLocales()
        Save_INI()
        UpdateUserInterface()
    End Sub
    Private Sub Menu_Language_JPN_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_Language_JPN.Click
        Language = "JPN"
        SetLocales()
        Save_INI()
        UpdateUserInterface()
    End Sub
    Private Sub Menu_Language_Chinese_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_Language_CHI.Click
        Language = "CHI"
        SetLocales()
        Save_INI()
        UpdateUserInterface()
    End Sub

    ' =======================================================================================
    '   MENU HELP
    ' =======================================================================================
    Private Sub Menu_Help_DropDownOpening(ByVal sender As Object, ByVal e As System.EventArgs) Handles Menu_Help.DropDownOpening
        SetLocales()
    End Sub
    Private Sub Menu_Help_ProgramHelp_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_Help_LinkToFiles.Click
        OpenSpectrometerOnThereminoSite()
    End Sub
    Private Sub Menu_Help_OpenProgramFolder_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_Help_OpenProgramFolder.Click
        Process.Start(Application.StartupPath)
    End Sub

    Friend Sub OpenSpectrometerOnThereminoSite()
        Select Case Language
            Case "ENG" : Process.Start("https://www.theremino.com/en/downloads/automation#spectrometer")
            Case "ITA" : Process.Start("https://www.theremino.com/downloads/automation#spectrometer")
            Case "FRA" : Process.Start("https://www.theremino.com/fr/downloads/automation#spectrometer")
            Case "ESP" : Process.Start("https://www.theremino.com/es/downloads/automation#spectrometer")
            Case "POR" : Process.Start("https://www.theremino.com/pt/downloads/automation#spectrometer")
            Case "DEU" : Process.Start("https://www.theremino.com/de/downloads/automation#spectrometer")
            Case "RUS" : Process.Start("https://www.theremino.com/ru/downloads/automation#spectrometer")
            Case "JPN" : Process.Start("https://www.theremino.com/ja/downloads/automation#spectrometer")
            Case "CHI" : Process.Start("https://www.theremino.com/zh/downloads/automation#spectrometer")
        End Select
    End Sub

    ' =======================================================================================
    '   MENU ABOUT
    ' =======================================================================================
    Private Sub Menu_About_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Menu_About.Click
        FormAbout.ShowDialog(Me)
    End Sub

    ' =======================================================================================
    '   TOOLSTRIP
    ' =======================================================================================
    Private Sub Tool_SaveSpectrum_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Tools_SaveSpectrum.Click
        SaveImage(PBox_Spectrum)
    End Sub
    Private Sub Tools_SaveTotal_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Tools_SaveTotal.Click
        Me.ToolStrip1.SuspendLayout()
        Tools_SaveTotal.Visible = False ' << This makes the SaveTotal with normal color (not blue) in the image
        Tools_SaveTotal.Visible = True
        StatusStrip1.Visible = False    ' << This makes the StatusStrip controls visible in the image
        Me.Refresh()
        SaveImage(Me)
        StatusStrip1.Visible = True
        Me.ToolStrip1.ResumeLayout()
    End Sub

    Private Sub Tools_SaveDataFile_CheckedChanged(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Tools_SaveDataFile.CheckedChanged
        If Not Tools_SaveDataFile.Checked Then
            Autosave_StopAll()
        Else
            If COM_IsOpen() Or WebCamIsWorking Then
                Autosave_Start()
            Else
                SaveSpectrumToFile_WithIncrementedIndex()
                Tools_SaveDataFile.Text = "- SAVED -"
                ToolStrip1.Refresh()
                Threading.Thread.Sleep(500)
                Autosave_StopAll()
            End If
        End If
    End Sub
    Private Sub Cmb_SaveTime_DropDownClosed(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Cmb_SaveTime.DropDownClosed
        SetDefaultFocus()
        Save_INI()
    End Sub

    Private Sub Tools_Options_CheckedChanged(ByVal sender As Object, ByVal e As System.EventArgs) Handles Tools_Options.CheckedChanged
        If Not EventsAreEnabled Then Return
        ShowHideOptions()
        ShowSpectrumGraph()
    End Sub

    Private Sub Tools_Info_CheckedChanged(ByVal sender As Object, ByVal e As System.EventArgs) Handles Tools_Info.CheckedChanged
        If Not EventsAreEnabled Then Return
        If Form_Info.Visible Then
            Form_Info.Visible = False
        Else
            'Form_Info.Visible = True
            Form_Info.Show(Me)
        End If
    End Sub

    Private Sub ToolStrip1_MouseEnter(ByVal sender As Object, ByVal e As System.EventArgs) Handles ToolStrip1.MouseEnter
        Me.Focus() ' with this the toolstrip responds always at the first click
    End Sub


    ' =========================================================================
    '  AUTOSAVE
    ' =========================================================================
    Private Autosave_Working As Boolean = False
    Private Autosave_NextTime As DateTime

    Private Sub Autosave_Start()
        If Cmb_SaveTime.SelectedIndex > 0 Then
            Autosave_SetNextTime()
        Else
            Tools_SaveDataFile.Text = Msg_WaitingSamples
        End If
        Autosave_Working = True
    End Sub

    Private Sub Autosave_StopAll()
        Autosave_Working = False
        Tools_SaveDataFile.Checked = False
        Tools_SaveDataFile.Text = Msg_SaveDataFile
    End Sub

    Private Sub Autosave_UpdateFromTimer()
        If Not Autosave_Working Then Return
        If Not COM_IsOpen() And Not WebCamIsWorking Then Return
        If Cmb_SaveTime.SelectedIndex = 0 Then Return
        Dim Seconds As Int32 = CInt(Now.Subtract(Autosave_NextTime).TotalSeconds)
        If Seconds > 0 Then
            SaveSpectrumToFile_WithIncrementedIndex()
            If Tools_Repeat.Checked Then
                Autosave_SetNextTime()
            Else
                Autosave_StopAll()
            End If
        Else
            Tools_SaveDataFile.Text = SecondsToHrsMinSec(-Seconds)
            ToolStrip1.Refresh()
        End If
    End Sub

    Friend Sub Autosave_UpdateFromReceivedSamples()
        If Not Autosave_Working Then Return
        If Not COM_IsOpen() And Not WebCamIsWorking Then Return
        If Cmb_SaveTime.SelectedIndex = 0 Then
            If Not Tools_Repeat.Checked Then
                Autosave_StopAll()
            End If
            SaveSpectrumToFile_WithIncrementedIndex()
        End If
    End Sub

    Private Sub Autosave_SetNextTime()
        Dim s As String = Cmb_SaveTime.Text.Trim.ToLower
        Dim n As Single = CSng(Val(s))
        If s.EndsWith("sec") Then
            n *= 1000
        ElseIf s.EndsWith("min") Then
            n *= 60000
        ElseIf s.EndsWith("hrs") Then
            n *= 3600000
        End If
        Autosave_NextTime = Now.AddMilliseconds(n)
    End Sub


    ' =========================================================================
    '  COMM FUNCTIONS
    ' =========================================================================
    Friend Sub OpenComm()
        '
        If SENSOR_Type = SensorTypes.WebCam Then Return
        '
        Spectrometer_ResetAllData()
        '
        Dim baudrate As Int32 = CInt(Val(Cmb_ComSpeed.Text))
        COM_Open(cmb_ComPort.Text, baudrate)
        '
        COM_SendOptionsToHardware()
        '
        Text = AppTitleAndVersion()
        ExposureTimeWaitInit()
        AverageStart()
        UpdateComButton()
        Timer1.Enabled = True
        '
        If COM_IsOpen() Then LastLoadedFile = "LastSpectrum"
        LoadCalibration("")
        Spectrometer_RedrawSamples()
        '
        COM_SendOptionsToHardware(10)
    End Sub

    Friend Sub CloseComm()
        Save_INI()
        COM_Close()
        UpdateComButton()
        ExposureTimeCountdownClose()
    End Sub

    Friend Sub UpdateComButton()
        If COM_IsOpen() Then
            btn_Connect.Checked = True
            btn_Connect.Text = Msg_Disconnect
            btn_Connect.BackColor = Color.FromArgb(255, 220, 160)
        Else
            btn_Connect.Checked = False
            btn_Connect.Text = Msg_Connect
            btn_Connect.BackColor = Color.FromArgb(240, 240, 240)
            GroupBox_Serial.BackColor = Color.FromArgb(255, 240, 200)
        End If
        btn_Connect.Refresh()
    End Sub

    Friend Sub FlashComArea()
        If Not COM_IsOpen() Then Return
        Static flag As Boolean
        flag = Not flag
        If flag Then
            GroupBox_Serial.BackColor = Color.FromArgb(255, 220, 180)
        Else
            GroupBox_Serial.BackColor = Color.FromArgb(255, 240, 200)
        End If
    End Sub

    Private Sub cmb_ComPort_DropDown(ByVal sender As Object, ByVal e As System.EventArgs) Handles cmb_ComPort.DropDown
        EventsAreEnabled = False
        ComboComPort_AddItems()
        EventsAreEnabled = True
    End Sub

    Friend Sub ComboComPort_AddItems()
        Dim c As String = cmb_ComPort.Text
        cmb_ComPort.Items.Clear()
        For Each s As String In COM_GetPortNames()
            cmb_ComPort.Items.Add(s)
        Next
        cmb_ComPort.Text = c
    End Sub

    Private Sub cmb_ComPort_TextChanged(ByVal sender As Object, ByVal e As System.EventArgs) Handles cmb_ComPort.TextChanged
        If Not EventsAreEnabled Then Return
        OpenComm()
    End Sub
    Private Sub cmb_ComPort_DropDownClosed(ByVal sender As Object, ByVal e As System.EventArgs) Handles cmb_ComPort.DropDownClosed
        SetDefaultFocus()
        Save_INI()
    End Sub

    Private Sub cmb_ComSpeed_KeyDown(ByVal sender As Object, ByVal e As System.Windows.Forms.KeyEventArgs) Handles Cmb_ComSpeed.KeyDown
        OnlyNumericComboBox(sender, e)
    End Sub
    Private Sub cmb_ComSpeed_TextChanged(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_ComSpeed.TextChanged
        If Not EventsAreEnabled Then Return
        OpenComm()
    End Sub
    Private Sub cmb_ComSpeed_DropDownClosed(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_ComSpeed.DropDownClosed
        SetDefaultFocus()
        Save_INI()
    End Sub

    Private Sub btn_Connect_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles btn_Connect.Click
        If COM_IsOpen() Then
            CloseComm()
        Else
            OpenComm()
        End If
    End Sub

    ' ==============================================================================================================
    '   WEB CAM FUNCTIONS
    ' ==============================================================================================================
    Friend Sub OpenWebCam()
        '
        If SENSOR_Type <> SensorTypes.WebCam Then Return
        '
        ' ---------------------------------------------------------------------
        Spectrometer_ResetAllData()
        ' ---------------------------------------------------------------------
        LoadCalibration("")
        Spectrometer_SetSourceParams()
        ' ---------------------------------------------------------------------
        VideoInDevice = Combo_GetValue(ComboBox_VideoInputDevice)
        Timer1.Stop()
        Application.DoEvents()
        Capture_STOP()
        Application.DoEvents()
        ' ---------------------------------------------------------------------
        Capture_START()
        ' ---------------------------------------------------------------------
        Timer1.Start()
        SetDefaultFocus()
        Form_VideoInControls.UpdateAllValues()
        Form_VideoInControls.Focus()
        ' ---------------------------------------------------------------------
        Text = AppTitleAndVersion()
        AverageStart()
        UpdateWebCamButton()
        If WebCamIsWorking Then LastLoadedFile = "LastSpectrum"
    End Sub

    Friend Sub CloseWebCam()
        Capture_STOP()
        UpdateWebCamButton()
        ExposureTimeCountdownClose()
        Save_INI()
    End Sub

    Friend Sub UpdateWebCamButton()
        If WebCamIsWorking Then
            btn_ConnectWebCam.Checked = True
            btn_ConnectWebCam.Text = Msg_Disconnect
            btn_ConnectWebCam.BackColor = Color.FromArgb(255, 220, 160)
        Else
            btn_ConnectWebCam.Checked = False
            btn_ConnectWebCam.Text = Msg_Connect
            btn_ConnectWebCam.BackColor = Color.FromArgb(240, 240, 240)
            GroupBox_Serial.BackColor = Color.FromArgb(255, 240, 200)
        End If
        btn_Connect.Refresh()
    End Sub

    Private Sub btn_ConnectWebCam_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles btn_ConnectWebCam.Click
        If WebCamIsWorking Then
            CloseWebCam()
        Else
            OpenWebCam()
        End If
    End Sub

    ' ==============================================================================================================
    '   COMBO BOX - VIDEO INPUT
    ' ==============================================================================================================
    Private Sub ComboBox_VideoInputDevice_InitWithCurrentDeviceName()
        Combo_Init(ComboBox_VideoInputDevice, VideoInDevice)
    End Sub
    Private Sub ComboBox_VideoInputDevice_DropDownClosed(ByVal sender As Object, ByVal e As System.EventArgs) Handles ComboBox_VideoInputDevice.DropDownClosed
        SetDefaultFocus()
    End Sub
    Private Sub ComboBox_VideoInputDevice_SelectedIndexChanged(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles ComboBox_VideoInputDevice.SelectedIndexChanged
        If Not EventsAreEnabled Then Exit Sub
        OpenWebCam()
        Save_INI()
    End Sub
    Private Sub ComboBox_VideoInputDevice_DropDown(ByVal sender As Object, ByVal e As System.EventArgs) Handles ComboBox_VideoInputDevice.DropDown
        ComboBox_VideoInputDevice_FillWithDevices()
        Combo_SetIndex_FromString(ComboBox_VideoInputDevice, VideoInDevice)
    End Sub

    Friend Sub ComboBox_VideoInputDevice_FillWithDevices()
        Dim fnames() As String
        fnames = EnumFiltersByCategory(FilterCategory.VideoInputDevice)
        With ComboBox_VideoInputDevice
            .Items.Clear()
            For Each fltName As String In fnames
                .Items.Add(fltName)
            Next
        End With
    End Sub

    ' ==============================================================================================================
    '   AUTO EXPOSURE
    ' ==============================================================================================================
    Private AutoExposureEnabled_OLD As Boolean

    Private Sub btn_Exposure_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles btn_Exposure.Click
        AutoExposureEnabled = Not AutoExposureEnabled
        UpdateAutoexposureButton()
    End Sub

    Friend Sub UpdateAutoexposureButton()
        If AutoExposureEnabled Then
            btn_Exposure.Text = Msg_AutoExp
            btn_Exposure.Checked = True
        Else
            btn_Exposure.Text = Msg_Exposure
            btn_Exposure.Checked = False
        End If
    End Sub

    Private Sub Cmb_ExposureTime_DropDown(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_ExposureTime.DropDown
        AutoExposureEnabled_OLD = AutoExposureEnabled
        AutoExposureEnabled = False
    End Sub
    Private Sub Cmb_ExposureTime_DropDownClosed(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_ExposureTime.DropDownClosed
        AutoExposureEnabled = AutoExposureEnabled_OLD
        SetDefaultFocus()
    End Sub
    Private Sub Cmb_ExposureTime_SelectedIndexChanged(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_ExposureTime.SelectedIndexChanged
        ExposureTimeInit()
    End Sub


    ' =========================================================================
    '  OPTIONS
    ' =========================================================================
    Private Sub Cmb_Options_SelectedIndexChanged(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_ExposureTime.SelectedIndexChanged, _
                                                                                                              Cmb_Resolution.SelectedIndexChanged, _
                                                                                                              Cmb_AdcSpeed.SelectedIndexChanged, _
                                                                                                              Cmb_DebugType.SelectedIndexChanged
        If Not EventsAreEnabled Then Return
        '
        COM_SendOptionsToHardware()
        SetDefaultFocus()
        Save_INI()
    End Sub

    Private Sub LoadLastSpectrumFile()
        If COM_IsOpen() Then Return
        If LastLoadedFile.Contains("LastSpectrum") Then
            LoadLastSpectrum()
        Else
            Dim s As String = txt_FilePath.Text + "\" + LastFileLoadedOrSavedByUser
            If IO.File.Exists(s) Then
                LoadSpectrumFile(s)
            End If
        End If
    End Sub

    Private Sub Cmb_Resolution_DropDown(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_Resolution.DropDown
        AutoExposureEnabled_OLD = AutoExposureEnabled
        AutoExposureEnabled = False
    End Sub
    Private Sub Cmb_Resolution_DropDownClosed(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_Resolution.DropDownClosed
        AutoExposureEnabled = AutoExposureEnabled_OLD
        SetDefaultFocus()
    End Sub
    Private Sub Cmb_Resolution_TextChanged(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_Resolution.TextChanged
        If Not EventsAreEnabled Then Return

    End Sub

    Private Sub Cmb_AdcSpeed_DropDown(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_AdcSpeed.DropDown
        AutoExposureEnabled_OLD = AutoExposureEnabled
        AutoExposureEnabled = False
    End Sub
    Private Sub Cmb_AdcSpeed_DropDownClosed(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_AdcSpeed.DropDownClosed
        AutoExposureEnabled = AutoExposureEnabled_OLD
        SetDefaultFocus()
    End Sub

    Private Sub Cmb_DebugType_DropDown(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_DebugType.DropDown
        AutoExposureEnabled_OLD = AutoExposureEnabled
        AutoExposureEnabled = False
    End Sub
    Private Sub Cmb_DebugType_DropDownClosed(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_DebugType.DropDownClosed
        AutoExposureEnabled = AutoExposureEnabled_OLD
        SetDefaultFocus()
    End Sub

    ' ==============================================================================================================
    '   AVERAGE
    ' ==============================================================================================================
    Private Sub Chk_Average_Click(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles chk_Average.Click
        AverageEnabled = Not AverageEnabled
        AverageStart()
        UpdateAverageLabel()
    End Sub

    Friend Sub AverageStart()
        AverageCounter = 1
        If AverageEnabled Then
            InitSpectrometerArraysIfChanged()
            AverageNumber = CInt(Val(Cmb_Average.Text))
        End If
    End Sub

    Friend Sub UpdateAverageLabel()
        If AverageEnabled Then
            chk_Average.BackColor = Color.FromArgb(255, 210, 120)
            chk_Average.Text = AverageCounter.ToString
            chk_Average.Checked = True
            Cmb_Average.BackColor = Color.White
        Else
            chk_Average.BackColor = Color.Transparent
            chk_Average.Text = Msg_Mean
            chk_Average.Checked = False
            Cmb_Average.BackColor = Color.LightGray
        End If
    End Sub

    Private Sub Cmb_Average_SelectedIndexChanged(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_Average.SelectedIndexChanged
        If Not EventsAreEnabled Then Exit Sub
        AverageNumber = CInt(Val(Cmb_Average.Text))
    End Sub

    Private Sub Cmb_Average_DropDownClosed(ByVal sender As Object, ByVal e As System.EventArgs) Handles Cmb_Average.DropDownClosed
        SetDefaultFocus()
    End Sub

    ' ==============================================================================================================
    '   COMBO BOX - FILE
    ' ==============================================================================================================
    Private Sub ComboBox_FileFormat_InitWithCurrentFileFormat()
        Combo_Init(ComboBox_FileType, FileFormat)
    End Sub
    Private Sub ComboBox_FileFormat_DropDownClosed(ByVal sender As Object, ByVal e As System.EventArgs) Handles ComboBox_FileType.DropDownClosed
        SetDefaultFocus()
    End Sub
    Private Sub ComboBox_FileFormat_SelectedIndexChanged(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles ComboBox_FileType.SelectedIndexChanged
        If Not EventsAreEnabled Then Exit Sub
        FileFormat = Combo_GetValue(ComboBox_FileType)
        SetDefaultFocus()
        Save_INI()
    End Sub
    Private Sub ComboBox_FileFormat_DropDown(ByVal sender As Object, ByVal e As System.EventArgs) Handles ComboBox_FileType.DropDown
        FillComboFileType()
    End Sub

    Friend Sub FillComboFileType()
        With ComboBox_FileType
            .Items.Clear()
            .Items.Add("JPG")
            .Items.Add("PNG")
            .Items.Add("TIFF")
            .Items.Add("EXIF")
            .Items.Add("EMF")
            .Items.Add("WMF")
            .Items.Add("GIF")
            .Items.Add("BMP")
            Combo_SetIndex_FromString(ComboBox_FileType, FileFormat)
        End With
    End Sub

    ' ==============================================================================================================
    '   BUTTONS AND COMMANDS
    ' ==============================================================================================================
    Private Sub txt_FilePath_MouseDown(ByVal sender As Object, ByVal e As System.Windows.Forms.MouseEventArgs) Handles txt_FilePath.MouseDown
        If e.Button = Windows.Forms.MouseButtons.Right Then
            If IO.Directory.Exists(txt_FilePath.Text) Then
                Process.Start(txt_FilePath.Text)
                txt_FilePath.Focus()
            End If
        End If
    End Sub
    Private Sub txt_FilePath_MouseDoubleClick(ByVal sender As Object, ByVal e As System.Windows.Forms.MouseEventArgs) Handles txt_FilePath.MouseDoubleClick
        SelectSaveFolder()
    End Sub
    Public Sub SelectSaveFolder()
        Dim FBD As System.Windows.Forms.FolderBrowserDialog
        FBD = New System.Windows.Forms.FolderBrowserDialog()
        With FBD
            ' -- USE ROOTFOLDER TO LIMIT USER CHOOSE AREA -- ( No RootFolder NO limits )
            '.RootFolder = Environment.SpecialFolder.MyComputer
            ' --------------------------------------------------------------------------
            .SelectedPath = txt_FilePath.Text
            .Description = vbCr & "Select the ""File Save Path"""
            If .ShowDialog = DialogResult.OK Then
                txt_FilePath.Text = .SelectedPath
            End If
        End With
    End Sub


    ' ==============================================================================================================
    '  FILTERS
    ' ==============================================================================================================
    Private Sub txt_RisingSpeed_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles txt_RisingSpeed.Click
        If My.Computer.Keyboard.CtrlKeyDown Then txt_RisingSpeed.NumericValue = 100
    End Sub
    Private Sub txt_FallingSpeed_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles txt_FallingSpeed.Click
        If My.Computer.Keyboard.CtrlKeyDown Then txt_FallingSpeed.NumericValue = 100
    End Sub
    Private Sub txt_RisingAndFalling_Changed(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles txt_RisingSpeed.TextChanged, _
                                                                                                                 txt_FallingSpeed.TextChanged
        If Not EventsAreEnabled Then Return
        Spectrometer_SetRunningModeParams()
    End Sub

    Private Sub txt_SpatialAveraging_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles txt_SpatialAveraging.Click
        If My.Computer.Keyboard.CtrlKeyDown Then txt_SpatialAveraging.NumericValue = 0
    End Sub
    Private Sub txt_SpatialAveraging_TextChanged(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles txt_SpatialAveraging.TextChanged
        If Not EventsAreEnabled Then Return
        Spectrometer_SetRunningModeParams()
        Spectrometer_RedrawSamples()
    End Sub

    Private Sub btn_Background_CheckedChanged(ByVal Sender As System.Object, ByVal e As System.EventArgs) Handles btn_Background.CheckedChanged
        If Not EventsAreEnabled Then Return
        If btn_Background.Checked Then
            Spectrometer_SetBackground()
        Else
            Spectrometer_ResetBackground()
        End If
        Spectrometer_RedrawSamples()
    End Sub
    Private Sub btn_Reference_CheckedChanged(ByVal Sender As System.Object, ByVal e As System.EventArgs) Handles btn_Reference.CheckedChanged
        If Not EventsAreEnabled Then Return
        If btn_Reference.Checked Then
            Spectrometer_SetReference()
        Else
            Spectrometer_ResetReference()
        End If
        Spectrometer_RedrawSamples()
    End Sub

    Private Sub btn_ResetSpectrumData_ClickButtonArea(ByVal Sender As System.Object, ByVal e As System.EventArgs) Handles btn_ResetSpectrumData.ClickButtonArea
        Spectrometer_ResetAllData()
    End Sub


    ' =======================================================================================
    '   MOUSE ZOOM and PAN on Pbox_Samples
    ' =======================================================================================
    Private CursorStartX As Int32
    Private CursorStartY As Int32
    Private InitialStartX As Double = -999
    Private InitialEndX As Double
    Private InitialStartY As Double = -999
    Private InitialZoomX As Double

    Private Sub PBox_Samples_MouseDown(ByVal sender As Object, ByVal e As System.Windows.Forms.MouseEventArgs) Handles PBox_Samples.MouseDown
        If e.Button = Windows.Forms.MouseButtons.Left Or _
           e.Button = Windows.Forms.MouseButtons.Right Then
            CursorStartX = e.X
            CursorStartY = e.Y
            InitialStartX = txt_StartX.NumericValue
            InitialEndX = txt_EndX.NumericValue
            InitialStartY = txt_StartY.NumericValue
            InitialZoomX = 1000 / (txt_EndX.NumericValueInteger - txt_StartX.NumericValueInteger)
        End If
        PBox_Samples.Focus()
    End Sub
    Private Sub PBox_Samples_MouseUp(ByVal sender As Object, ByVal e As System.Windows.Forms.MouseEventArgs) Handles PBox_Samples.MouseUp
        InitialStartX = -999
        InitialStartY = -999
        Save_INI()
    End Sub
    Private Sub PBox_Samples_MouseMove(ByVal sender As Object, ByVal e As System.Windows.Forms.MouseEventArgs) Handles PBox_Samples.MouseMove
        If e.Button = Windows.Forms.MouseButtons.Left Or _
           e.Button = Windows.Forms.MouseButtons.Right Then
            '
            If InitialStartX < 0 Or InitialStartY < 0 Then Return
            ' --------------------------------------------------------------------- SCROLL X
            Dim dx As Double
            dx = -InitialZoomX * ((e.X - CursorStartX) * (InitialEndX - InitialStartX)) / PBox_Samples.ClientSize.Width
            '
            Dim DiffX As Double = InitialEndX - InitialStartX
            Dim StartX As Double = InitialStartX - dx
            Dim EndX As Double = InitialEndX - dx
            '
            If StartX < 0 Then StartX = 0
            If StartX + DiffX > 1000 Then StartX = 1000 - DiffX
            If EndX > 1000 Then EndX = 1000
            If EndX - DiffX < 0 Then EndX = DiffX
            '
            txt_StartX.NumericValue = StartX
            txt_EndX.NumericValue = EndX

            ' --------------------------------------------------------------------- SCROLL Y
            If UseCtrlMouseForZoom Then
                Dim dy As Double
                dy = (e.Y - CursorStartY) * txt_SizeY.NumericValueInteger / 100
                Dim Starty As Double = InitialStartY + dy
                If Starty < 0 Then Starty = 0
                If Starty > 1000 Then Starty = 1000
                txt_StartY.NumericValue = Starty
                txt_StartY.Refresh()
            End If
            '
            Spectrometer_SetSourceParams()
            Spectrometer_RedrawSamples()
        End If
    End Sub
    Private Sub PBox_Samples_MouseWheel(ByVal sender As Object, ByVal e As System.Windows.Forms.MouseEventArgs) Handles PBox_Samples.MouseWheel
        Dim old As Boolean = EventsAreEnabled
        EventsAreEnabled = False
        If SENSOR_Type = SensorTypes.WebCam And My.Computer.Keyboard.CtrlKeyDown Then
            ' --------------------------------------------------------------------- Zoom vertical for the WebCams
            If UseCtrlMouseForZoom Then
                Dim dy As Double = e.Delta / 10.0F
                Dim sizey As Double = txt_SizeY.NumericValue - dy
                txt_SizeY.NumericValue = sizey
                If sizey > 1 Then
                    Dim MousePosY As Double = 1 - (e.Y / PBox_Samples.ClientSize.Height)
                    txt_StartY.NumericValue += dy * MousePosY
                End If
            End If
        Else
            Dim StartX As Single = txt_StartX.NumericValueInteger
            Dim EndX As Single = txt_EndX.NumericValueInteger
            ' --------------------------------------------------------------------- Zoom quantity
            Dim dx As Single = (e.Delta * EndX - StartX) / 2000.0F
            If Math.Abs(dx) < 1 Then dx = Math.Sign(dx)
            ' --------------------------------------------------------------------- Zoom position
            Dim l As Int32 = Samples_BorderLeft
            Dim k1 As Single = CSng((e.X - l) / (PBox_Samples.Width - l))
            Dim k2 As Single = 1 - k1
            ' --------------------------------------------------------------------- Apply the zoom
            txt_StartX.NumericValue = StartX + dx * k1
            txt_EndX.NumericValue = EndX - dx * k2
        End If
        ' ---------------------------------------------------------------------
        EventsAreEnabled = old
        Spectrometer_SetSourceParams()
        Spectrometer_RedrawSamples()
    End Sub

    ' =======================================================================================
    '   MOUSE ZOOM and PAN and CURSOR on Pbox_Spectrum
    ' =======================================================================================
    Private TrimmingPoint As Int32
    Private InitialNM As Double
    Private InitialBIN As Double
    Private TrimmingPointModified As Boolean

    Private Sub PBox_Spectrum_MouseDown(ByVal sender As Object, ByVal e As System.Windows.Forms.MouseEventArgs) Handles PBox_Spectrum.MouseDown
        '
        MouseEventOnPboxSpectrum = True
        '
        If e.Button = Windows.Forms.MouseButtons.Left Or _
           e.Button = Windows.Forms.MouseButtons.Right Then
            ' ----------------------------------------------------------------------------
            CursorStartX = e.X
            InitialStartX = txt_StartX.NumericValueInteger
            InitialEndX = txt_EndX.NumericValueInteger
            ' ----------------------------------------------------------------------------
            TrimmingPoint = -1
            If btn_TrimScale.Checked AndAlso e.Y < 15 Then
                ' ------------------------------------------------------------------------ If near to label then set InitialNM and InitialBIN
                For i As Int32 = 0 To Calib_NM.Length - 1
                    If Math.Abs(e.X - Nanometers_To_X(Calib_NM(i))) < 20 Then
                        TrimmingPoint = i
                        InitialNM = Calib_NM(i)
                        InitialBIN = Calib_BIN(i)
                        ShowTrimmingData(i)
                        Exit For
                    End If
                Next
                ' ------------------------------------------------------------------------ ADD or DELETE trim points
                If e.Button = Windows.Forms.MouseButtons.Right Then
                    Dim title As String = "Theremino Spectrometer"
                    If TrimmingPoint < 0 Then
                        If e.X >= Spectrometer_GetDestLeft() Then
                            If MessageBox.Show(Msg_NewTrimPoint, title, _
                                                MessageBoxButtons.OKCancel) = Windows.Forms.DialogResult.OK Then
                                Dim nm As Double = X_To_Nanometers(e.X)
                                AddTrimmingPoint(Calib_NmToBin(nm), nm)
                                TrimmingPointModified = True
                                Spectrometer_ShowReceivedSamples()
                            End If
                        End If
                    Else
                        If Calib_NM.Length < 3 Then
                            MessageBox.Show(Msg_CanNotDelete, title)
                        Else
                            If MessageBox.Show(Msg_Delete, title, _
                                               MessageBoxButtons.OKCancel) = Windows.Forms.DialogResult.OK Then
                                RemoveTrimmingPoint(TrimmingPoint)
                                TrimmingPointModified = True
                                Spectrometer_ShowReceivedSamples()
                            End If
                        End If
                    End If
                    TrimmingPoint = -1
                    If TrimmingPointModified Then
                        SaveCalibration("")
                    End If
                End If
                Spectrometer_SetScaleTrimParams()
            End If
        End If
        ' ----------------------------------------------------------------------------
        PBox_Spectrum.Focus()
        ShowSpectrumGraph()
    End Sub
    Private Sub PBox_Spectrum_MouseUp(ByVal sender As Object, ByVal e As System.Windows.Forms.MouseEventArgs) Handles PBox_Spectrum.MouseUp
        InitialStartX = -999
        Save_INI()
        Spectrometer_ShowReceivedSamples()
        ShowSpectrumGraph()
        If TrimmingPointModified Then
            SaveCalibration("")
        End If
        MouseEventOnPboxSpectrum = True
    End Sub
    Private Sub PBox_Spectrum_MouseMove(ByVal sender As Object, ByVal e As System.Windows.Forms.MouseEventArgs) Handles PBox_Spectrum.MouseMove
        If e.Button = Windows.Forms.MouseButtons.Left Or _
           e.Button = Windows.Forms.MouseButtons.Right Then
            '
            If InitialStartX < 0 Then Return
            '
            Dim dx As Double
            If TrimmingPoint >= 0 Then
                dx = e.X - CursorStartX
                Dim StartX As Double = txt_StartX.NumericValue
                Dim EndX As Double = txt_EndX.NumericValue
                ' --------------------------------------------------------------------- Zoom quantity
                Dim zoom As Double
                zoom = 0.001
                zoom = zoom * (EndX - StartX) / Me.Width
                ' --------------------------------------------------------------------- Edit trim point
                If Not My.Computer.Keyboard.CtrlKeyDown Then
                    EditCalibBIN(TrimmingPoint, InitialBIN + dx * zoom * 2000)
                Else
                    EditCalibNM(TrimmingPoint, InitialNM + dx * zoom * 100)
                End If
                TrimmingPointModified = True
                ' --------------------------------------------------------------------- Update
                ShowTrimmingData(TrimmingPoint)
                Spectrometer_ShowReceivedSamples()
                PBox_Samples.Refresh()
                Spectrometer_SetScaleTrimParams()
                ShowSpectrumGraph()
            Else
                dx = ((e.X - CursorStartX) * (InitialEndX - InitialStartX)) / PBox_Spectrum.ClientSize.Width
                '
                Dim DiffX As Double = InitialEndX - InitialStartX
                Dim StartX As Double = InitialStartX - dx
                Dim EndX As Double = InitialEndX - dx
                '
                If StartX < 0 Then StartX = 0
                If StartX + DiffX > 1000 Then StartX = 1000 - DiffX
                If EndX > 1000 Then EndX = 1000
                If EndX - DiffX < 0 Then EndX = DiffX
                '
                txt_StartX.NumericValue = StartX
                txt_EndX.NumericValue = EndX
                '
                Spectrometer_SetSourceParams()
                Spectrometer_RedrawSamples()
            End If
        End If
        CursorX = e.X
        CursorY = e.Y
        PrintValueAndNanometers()
    End Sub

    Private Sub PBox_Spectrum_MouseWheel(ByVal sender As Object, ByVal e As System.Windows.Forms.MouseEventArgs) Handles PBox_Spectrum.MouseWheel
        Dim StartX As Single = txt_StartX.NumericValueInteger
        Dim EndX As Single = txt_EndX.NumericValueInteger
        ' --------------------------------------------------------------------- zoom quantity
        Dim dx As Single = (e.Delta * EndX - StartX) / 2000.0F
        If My.Computer.Keyboard.CtrlKeyDown Then dx *= 0.1F
        If Math.Abs(dx) < 1 Then dx = Math.Sign(dx)
        ' --------------------------------------------------------------------- zoom position
        Dim l As Int32 = Spectrometer_GetDestLeft()
        Dim k1 As Single = CSng((e.X - l) / (PBox_Spectrum.Width - l))
        Dim k2 As Single = 1 - k1
        ' --------------------------------------------------------------------- apply the zoom
        Dim old As Boolean = EventsAreEnabled
        EventsAreEnabled = False
        txt_StartX.NumericValue = StartX + dx * k1
        txt_EndX.NumericValue = EndX - dx * k2
        EventsAreEnabled = old
        Spectrometer_SetSourceParams()
        Spectrometer_RedrawSamples()
    End Sub
    Private Sub PBox_Spectrum_MouseEnter(ByVal sender As Object, ByVal e As System.EventArgs) Handles PBox_Spectrum.MouseEnter
        CursorInside = True
    End Sub
    Private Sub PBox_Spectrum_MouseLeave(ByVal sender As Object, ByVal e As System.EventArgs) Handles PBox_Spectrum.MouseLeave
        Spectrometer_PrintMaxValueAndNanometers()
        CursorInside = False
    End Sub

    ' ==============================================================================================================
    '   SHOW TRIMMING DATA
    ' ==============================================================================================================
    Private Sub ShowTrimmingData(ByVal i As Int32)
        ' ---------------------------------------------------------------------
        Dim nm1 As Double = Calib_NM(i)
        Dim bin1 As Double = Calib_BIN(i)
        ' --------------------------------------------------------------------- initialize text
        Dim s As String = "TRIM:  " + nm1.ToString("0.00", GCI) & " nm   "
        ' --------------------------------------------------------------------- if more than 2 points then calc the error
        If Calib_NM.Length > 2 Then
            ' ----------------------------------------------------------------- test if first or last point
            Dim InvertSign As Boolean = False
            If i = 0 Then
                i = 1
                InvertSign = True
            End If
            If i = Calib_NM.Length - 1 Then
                i = Calib_NM.Length - 2
                InvertSign = True
            End If
            nm1 = Calib_NM(i)
            bin1 = Calib_BIN(i)
            ' ----------------------------------------------------------------- calc bin2
            Dim k, bin2 As Double
            k = (nm1 - Calib_NM(i - 1)) / (Calib_NM(i + 1) - Calib_NM(i - 1))
            bin2 = Calib_BIN(i - 1) + (Calib_BIN(i + 1) - Calib_BIN(i - 1)) * k
            ' ----------------------------------------------------------------- error as percentual
            If InvertSign Then
                s += (100 * bin1 / bin2 - 100).ToString("-0.00;+0.00", GCI) + "%"
            Else
                s += (100 * bin1 / bin2 - 100).ToString("+0.00;-0.00", GCI) + "%"
            End If
        End If
        ' --------------------------------------------------------------------- show text
        Label_MaxPeak.BorderStyle = BorderStyle.FixedSingle
        Label_MaxPeak.BackColor = Color.FromArgb(255, 220, 0)
        Label_MaxPeak.Text = s
        Label_MaxPeak.Refresh()
    End Sub

    ' ==============================================================================================================
    '   DROP SPECTRUM FILES
    ' ==============================================================================================================
    Private Sub Me_DragEnter(ByVal sender As Object, ByVal e As System.Windows.Forms.DragEventArgs) Handles Me.DragEnter
        If e.Data.GetDataPresent(DataFormats.FileDrop) Then
            ' ---------------------------------------------------------------- Get files for checking
            Dim data As Object = e.Data.GetData("FileDrop", True)
            Dim filePaths As String() = DirectCast(data, String())
            ' ---------------------------------------------------------------- Check if folder
            Dim isDir As Boolean = (IO.File.GetAttributes(filePaths(0)) And _
                                    IO.FileAttributes.Directory) = _
                                    IO.FileAttributes.Directory
            If isDir = True Then
                e.Effect = DragDropEffects.None
                Return
            End If
            ' ----------------------------------------------------------------- Check extension
            Dim fileExtension As String = IO.Path.GetExtension(filePaths(0))
            If Not filePaths.Length = 1 Or Not (fileExtension.ToLower = ".txt" Or fileExtension.ToLower = ".csv") Then
                e.Effect = DragDropEffects.None
            Else
                e.Effect = DragDropEffects.Copy
            End If
        End If
    End Sub

    Private Sub Me_DragDrop(ByVal sender As Object, ByVal e As System.Windows.Forms.DragEventArgs) Handles Me.DragDrop
        Dim file_names As String() = DirectCast(e.Data.GetData(DataFormats.FileDrop), String())
        If file_names.Length > 0 Then
            LoadSpectrumFile(file_names(0))
        End If
    End Sub



    ' ==============================================================================================================
    '   PARAMS
    ' ==============================================================================================================
    Private Sub Params_LostFocus(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles txt_FileName.LostFocus, _
                                                                                                     txt_FilePath.LostFocus, _
                                                                                                     chk_AdcMinAuto.LostFocus, _
                                                                                                     txt_AdcMax.LostFocus, _
                                                                                                     txt_AdcMin.LostFocus, _
                                                                                                     chk_FlipH.LostFocus, _
                                                                                                     chk_FlipV.LostFocus, _
                                                                                                     txt_StartX.LostFocus, _
                                                                                                     txt_EndX.LostFocus, _
                                                                                                     txt_StartY.LostFocus, _
                                                                                                     txt_SizeY.LostFocus, _
                                                                                                     txt_LogScale.LostFocus, _
                                                                                                     txt_SpatialAveraging.LostFocus, _
                                                                                                     txt_RisingSpeed.LostFocus, _
                                                                                                     txt_FallingSpeed.LostFocus
        If Not EventsAreEnabled Then Return
        Save_INI()
    End Sub

    Private Sub txt_AdcMin_TextChanged(ByVal sender As Object, ByVal e As System.EventArgs) Handles txt_AdcMin.TextChanged
        If Not EventsAreEnabled Then Return
        Spectrometer_ProcessReceivedSamples()
        Spectrometer_RedrawSamples()
    End Sub


    Private Sub txt_LogScale_Click(ByVal sender As Object, ByVal e As System.EventArgs) Handles txt_LogScale.Click
        If My.Computer.Keyboard.CtrlKeyDown Then txt_LogScale.NumericValue = 0
    End Sub

    Private Sub Params_Changed(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles chk_FlipH.CheckedChanged, _
                                                                                                   chk_FlipV.CheckedChanged, _
                                                                                                   txt_StartX.TextChanged, _
                                                                                                   txt_EndX.TextChanged, _
                                                                                                   txt_StartY.TextChanged, _
                                                                                                   txt_SizeY.TextChanged
        '
        txt_StartX.MaxValue = txt_EndX.NumericValue - 20
        txt_EndX.MinValue = txt_StartX.NumericValue + 20
        txt_StartY.MaxValue = 1000 - txt_SizeY.NumericValueInteger
        'txt_SizeY.MaxValue = 1000 - txt_SizeY.NumericValueInteger
        txt_StartX.Refresh()
        txt_EndX.Refresh()
        txt_StartY.Refresh()
        txt_SizeY.Refresh()
        If Not EventsAreEnabled Then Return
        ' -------------------------------------------------------------- Correct the StartY
        Static OldSizeY As Double
        If txt_SizeY.NumericValue <> OldSizeY Then
            If OldSizeY <> 0 Then
                Dim dy As Double = txt_SizeY.NumericValue - OldSizeY
                EventsAreEnabled = False
                txt_StartY.NumericValue -= dy * 0.5
                EventsAreEnabled = True
            End If
            OldSizeY = txt_SizeY.NumericValue
        End If
        ' --------------------------------------------------------------
        Spectrometer_SetSourceParams()
        Spectrometer_RedrawSamples()
    End Sub

    Private Sub txt_LogScale_TextChanged(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles txt_LogScale.TextChanged
        If Not EventsAreEnabled Then Return
        Spectrometer_SetRunningModeParams()
        Spectrometer_RedrawSamples()
    End Sub

    Private Sub btn_Dips_CheckedChanged(ByVal Sender As Object, ByVal e As System.EventArgs) Handles btn_Dips.CheckedChanged
        If Not EventsAreEnabled Then Return
        Spectrometer_SetRunningModeParams()
        Spectrometer_RedrawSamples()
    End Sub
    Private Sub btn_Peaks_CheckedChanged(ByVal Sender As Object, ByVal e As System.EventArgs) Handles btn_Peaks.CheckedChanged
        If Not EventsAreEnabled Then Return
        Spectrometer_SetRunningModeParams()
        Spectrometer_RedrawSamples()
    End Sub
    Private Sub btn_Colors_CheckedChanged(ByVal Sender As Object, ByVal e As System.EventArgs) Handles btn_Colors.CheckedChanged
        If Not EventsAreEnabled Then Return
        Spectrometer_SetRunningModeParams()
        Spectrometer_RedrawSamples()
    End Sub
    Private Sub btn_TrimScale_CheckedChanged(ByVal Sender As Object, ByVal e As System.EventArgs) Handles btn_TrimScale.CheckedChanged
        If Not EventsAreEnabled Then Return
        Spectrometer_SetRunningModeParams()
        Spectrometer_RedrawSamples()
    End Sub

    ' ==============================================================================================================
    '   EXPOSURE TIME INIT and COUNTDOWN
    ' ==============================================================================================================
    Friend ExposureTimeMicroSec As UInt32

    Private Sub ExposureTimeInit()
        ExposureTimeMicroSec = GetExposureTimeMicrosec()
        ExposureTimeWaitInit()
    End Sub

    Friend Function GetExposureTimeMicrosec() As UInt32
        Dim s As String = Cmb_ExposureTime.Text.Trim.ToLower
        Dim microsec As UInt32 = CUInt(Val(s))
        If s.EndsWith("ms") Then
            microsec *= 1000UI
        ElseIf s.EndsWith("sec") Then
            microsec *= 1000000UI
        ElseIf s.EndsWith("min") Then
            microsec *= 60000000UI
        End If
        Return microsec
    End Function

    Friend ExposureTimeStopWatch As Stopwatch = New Stopwatch
    Friend ExposureTimeSeconds As UInt32

    Friend Sub ExposureTimeWaitInit()
        If COM_IsOpen() And ExposureTimeMicroSec > 1000000 Then
            lbl_ExposureCountDown.Text = Msg_PleaseWait
            lbl_ExposureCountDown.BackColor = Color.Orange
            lbl_ExposureCountDown.Visible = True
            ExposureTimeSeconds = 0
        End If
    End Sub

    Friend Sub ExposureTimeCountdownInit()
        If COM_IsOpen() And ExposureTimeMicroSec > 1000000 Then
            ExposureTimeSeconds = ExposureTimeMicroSec \ 1000000UI
            ExposureTimeStopWatch.Reset()
            ExposureTimeStopWatch.Start()
        Else
            ExposureTimeCountdownClose()
        End If
    End Sub

    Private Sub ExposureTimeCountdownClose()
        ExposureTimeSeconds = 0
        lbl_ExposureCountDown.Visible = False
    End Sub

    Private Sub ExposureTimeCountdownDecrease()
        If ExposureTimeSeconds > 0 Then
            If Not lbl_ExposureCountDown.Text.StartsWith("Waiting") Then
                PlaySound_Success_Wait()
            End If
            '
            Dim sec As Int32 = CInt(ExposureTimeSeconds) - CInt(ExposureTimeStopWatch.Elapsed.TotalSeconds)
            If sec < 0 Then sec = 0
            '
            lbl_ExposureCountDown.Text = "Waiting " + sec.ToString + " sec."
            lbl_ExposureCountDown.BackColor = Color.Transparent
            lbl_ExposureCountDown.Visible = True
            ' Debug.Print(ExposureTimeSecCounter.ToString)
        Else
            'lbl_ExposureCountDown.Visible = False
        End If
    End Sub

    ' ==============================================================================================================
    '   TIMER 10 Hz
    ' ==============================================================================================================
    Private Sub Timer_10Hz_Tick(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Timer_10Hz.Tick
        If Not EventsAreEnabled Then Return
        ' ------------------------------------------------------------- TEST ARDUINO IDE
        TestArduinoIde()
        ' ------------------------------------------------------------- AUTOSAVE UPDATE
        Autosave_UpdateFromTimer()
        ' ------------------------------------------------------------- EXTERNAL COMMANDS
        PollTextCommandsSlot()
        ' ------------------------------------------------------------- Decrease count down 
        ExposureTimeCountdownDecrease()
        ' ------------------------------------------------------------- Update FormInfo
        UpdateFormInfo()
    End Sub

    ' ==============================================================================================================
    '   CAPTURE TIMER - 10 mS
    ' ==============================================================================================================
    Private Timer1_Working As Boolean = False

    Private Sub Timer1_Tick(ByVal sender As System.Object, ByVal e As System.EventArgs) Handles Timer1.Tick
        If Not EventsAreEnabled Then Return
        PollWebCamsAndSensors()
    End Sub

    Private Sub PollWebCamsAndSensors()
        If SENSOR_Type = SensorTypes.WebCam Then
            ' -------------------------------------------------------- Capture image
            'If Not Tools_Run.Checked Then Return
            If Capture_Image Is Nothing OrElse Capture_Image.PixelFormat = Imaging.PixelFormat.Undefined Then
                Capture_NewImageIsReady = False
                Return
            End If
            If Timer1_Working Then Exit Sub
            Timer1_Working = True
            ProcessCapturedImage()
            Timer1_Working = False
        Else
            ' -------------------------------------------------------- COM POLLING
            If COM_IsOpen() Then
                COM_Polling()
            Else
                Timer1.Enabled = False
                UpdateComButton()
                Return
            End If
        End If
    End Sub

End Class
