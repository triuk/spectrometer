
Imports System.Drawing
Imports System.Drawing.Imaging
Imports System.Drawing.Drawing2D
Imports System.Runtime.InteropServices

Module Spectrometer

    Friend VideoInDevice As String = ""

    Friend Enum SensorTypes As Byte
        WebCam
        TCD1304
        TCD1254
    End Enum

    Friend SENSOR_Type As SensorTypes = SensorTypes.WebCam

    Friend CursorInside As Boolean
    Friend CursorX As Int32
    Friend CursorY As Int32

    Friend DestPbox As PictureBox

    Private ShowDips As Boolean
    Private ShowPeaks As Boolean
    Private UseColors As Boolean
    Private TrimScale As Boolean

    Friend MaxPeakValue As Single
    Friend MaxVisibleValue As Single
    Friend MaxPeakValue_Index As Int32

    Private LogScale As Double = 1
    Private Filter As Int32
    Private SpeedUP As Int32
    Private SpeedDW As Int32
    Private Flip As Boolean

    Private KFilter As Single
    Private KSpeedUP As Single
    Private KSpeedDW As Single
    Private Kred As Single
    Private Kgreen As Single
    Private Kblue As Single

    Private SrcY0 As Int32
    Private SrcDY As Int32

    Private SrcX0 As Int32
    Private SrcDX As Int32
    Private SrcW As Int32
    Private SrcH As Int32

    Private DestLeft As Int32 = 37
    Private DestWidth As Int32
    Private DestRight As Int32
    Private DestBottom As Int32
    Private DestW As Int32
    Private DestH As Int32

    Private ScalePen1 As Pen = New Pen(Color.FromArgb(0, 0, 0))
    Private ScalePen2 As Pen = New Pen(Color.FromArgb(100, 100, 100))
    Private ScalePen3 As Pen = New Pen(Color.FromArgb(160, 160, 160))
    Private ScalePen4 As Pen = New Pen(Color.FromArgb(200, 200, 200))
    Private ScalePen5 As Pen = New Pen(Color.FromArgb(230, 230, 230))
    Private ScaleFont As Font = New Font("Arial", 8)
    Private ScaleFontBold As Font = New Font("Arial", 9, FontStyle.Bold)

    Friend NanometersMin As Double = 100
    Friend NanometersMax As Double = 1500
    Private NanometersDelta As Double

    Private NmStart As Double
    Private NmEnd As Double
    Private NmStartDiv As Int32
    Private NmCoeff As Double

    Private gfx As Graphics
    Private kx As Single
    Private ky As Single
    Private Pen_Graph As Pen = New Pen(Color.Black)

    Private FpsAndMillisecTimer As PrecisionTimer = New PrecisionTimer
    Private ReceivedValueMin, ReceivedValueMax As Single
    Private ValueMinSubtractor As Single

    Private FlipH As Boolean
    Private FlipV As Boolean
    Private AdcScale As Int32
    Private ScaleCoeff_to65536 As Int32

    Friend SENSOR_NumSamples As Int32 = 3600

    ' ================================================================================
    '  ARRAYS
    ' ================================================================================
    Private Array_ReceivedSamples(-1) As Single
    Private Array_AverageFiltered(-1) As Single
    Private Array_UpDownFiltered(-1) As Single
    Private Array_Calibrated(-1) As Single
    Private Array_SpatialFiltered(-1) As Single
    Private Array_VisibleSamples(-1) As Single

    Friend Sub InitSpectrometerArraysIfChanged()
        If SENSOR_NumSamples <> Array_ReceivedSamples.Length OrElse SENSOR_NumSamples <> Array_AverageFiltered.Length Then
            InitSpectrometerArrays()
        End If
    End Sub

    Friend Sub InitSpectrometerArrays()
        ReDim Array_ReceivedSamples(SENSOR_NumSamples - 1)
        ReDim Array_AverageFiltered(SENSOR_NumSamples - 1)
        ReDim Array_UpDownFiltered(SENSOR_NumSamples - 1)
        ReDim Array_Calibrated(SENSOR_NumSamples - 1)
        ReDim Array_SpatialFiltered(SENSOR_NumSamples - 1)
    End Sub

    Friend Sub Spectrometer_ResetAllData()
        Spectrometer_SetSourceParams()
        InitSpectrometerArrays()
        ResetClipBoardData()
        Spectrometer_RedrawSamples()
        LastLoadedFile = ""
    End Sub

    ' ================================================================================
    '  SET PARAMS
    ' ================================================================================
    Friend Sub Spectrometer_SetSourceParams()
        ' --------------------------------------------------------------------- Equalize SrcW with SENSOR_NumSamples
        If SENSOR_Type = SensorTypes.WebCam Then
            If WebCamIsWorking Then
                ' ------------------------------------------------------------- Test if SrcImage is valid
                If SrcImage IsNot Nothing AndAlso _
                   SrcImage.PixelFormat <> PixelFormat.Undefined Then
                    SrcW = SrcImage.Width
                    SrcH = SrcImage.Height
                Else
                    SrcW = 1600
                    SrcH = 1
                End If
                ' ------------------------------------------------------------- Normalize Array
                Calib_BIN = NormalizeArrayTo(Calib_BIN, _
                                             SENSOR_NumSamples, _
                                             SrcW)
                SENSOR_NumSamples = SrcW
            End If
        Else
            SrcW = SENSOR_NumSamples
        End If
        ' --------------------------------------------------------------------- Read parameters
        Flip = Form1.chk_FlipH.Checked
        Dim StartX As Int32 = Form1.txt_StartX.NumericValueInteger
        Dim EndX As Int32 = Form1.txt_EndX.NumericValueInteger
        Dim StartY As Int32 = Form1.txt_StartY.NumericValueInteger
        Dim SizeY As Int32 = Form1.txt_SizeY.NumericValueInteger
        ' --------------------------------------------------------------------- AREA X
        SrcX0 = (SrcW * StartX) \ 1000
        SrcDX = SrcW - SrcX0 + (SrcW * (EndX - 1000)) \ 1000
        If SrcX0 + SrcDX > SrcW Then SrcDX = SrcW - SrcX0
        If SrcDX <= 0 Then SrcX0 += (SrcDX - 1) : SrcDX = 1
        If SrcX0 < 0 Then SrcX0 = 0
        ' --------------------------------------------------------------------- AREA Y
        SrcDY = (SrcH * SizeY) \ 1000
        SrcY0 = SrcH - (SrcH * StartY \ 1000) - SrcDY
        If SrcY0 + SrcDY > SrcH Then SrcDY = SrcH - SrcY0
        If SrcDY <= 0 Then SrcY0 += (SrcDY - 1) : SrcDY = 1
        If SrcY0 < 0 Then SrcY0 = 0
        ' --------------------------------------------------------------------- AREA Y - Coefficients
        Kred = 0.299F / SrcDY
        Kgreen = 0.587F / SrcDY
        Kblue = 0.114F / SrcDY
        ' --------------------------------------------------------------------- Redim Array_VisibleSamples
        If SrcDX <> Array_VisibleSamples.Length Then
            ReDim Array_VisibleSamples(SrcDX - 1)
        End If
        ' --------------------------------------------------------------------- SetScaleTrimParams()
        Spectrometer_SetScaleTrimParams()
    End Sub

    Friend Sub Spectrometer_RedrawSamples()
        Spectrometer_ShowReceivedSamples()
        Form1.PBox_Samples.Refresh()
        ShowSpectrumGraph()
    End Sub

    Friend Sub Spectrometer_SetRunningModeParams()
        ShowDips = Form1.btn_Dips.Checked()
        ShowPeaks = Form1.btn_Peaks.Checked()
        UseColors = Form1.btn_Colors.Checked()
        TrimScale = Form1.btn_TrimScale.Checked()
        Dim LogN As Double = Form1.txt_LogScale.NumericValue
        If LogN >= 0 Then
            LogScale = 1 / (1 + LogN / 5)
        Else
            LogScale = 1.6 ^ -LogN
        End If
        Filter = Form1.txt_SpatialAveraging.NumericValueInteger
        KFilter = 0.1F + 0.9F * ((10 - Filter) / 10.0F) ' KFilter = 0.1 to 1
        SpeedUP = Form1.txt_RisingSpeed.NumericValueInteger
        SpeedDW = Form1.txt_FallingSpeed.NumericValueInteger
        KSpeedUP = SpeedUP / 100.0F
        KSpeedUP = CSng(KSpeedUP ^ 1.5)
        KSpeedDW = SpeedDW / 100.0F
        KSpeedDW = CSng(KSpeedDW ^ 1.5)
        '
        Dim ColorOrange As Color = Color.FromArgb(255, 200, 110)
        '
        Form1.Label_RisingSpeed.BackColor = If(SpeedUP < 100, ColorOrange, Color.Transparent)
        Form1.Label_FallingSpeed.BackColor = If(SpeedDW < 100, ColorOrange, Color.Transparent)
        Form1.txt_RisingSpeed.BackColor = If(SpeedUP < 100, ColorOrange, Color.White)
        Form1.txt_FallingSpeed.BackColor = If(SpeedDW < 100, ColorOrange, Color.White)
        '
        Form1.Label_LogScale.BackColor = If(LogN <> 0, ColorOrange, Color.Transparent)
        Form1.txt_LogScale.BackColor = If(LogN <> 0, ColorOrange, Color.White)
        Form1.Label_SpatialAveraging.BackColor = If(Filter > 0, ColorOrange, Color.Transparent)
        Form1.txt_SpatialAveraging.BackColor = If(Filter > 0, ColorOrange, Color.White)
    End Sub

    Friend Sub Spectrometer_SetScaleTrimParams()
        If SrcW = 0 Then Return
        '
        NanometersMin = Calib_BinToNm(0)
        NanometersMax = Calib_BinToNm(SENSOR_NumSamples)
        '
        If NanometersMin < 0 Then NanometersMin = 0
        If NanometersMax > 4000 Then NanometersMax = 4000
        If NanometersMax < NanometersMin + 10 Then NanometersMax = NanometersMin + 10
        NanometersDelta = NanometersMax - NanometersMin
        ' ---------------------------------------------------------------------
        NmStart = NanometersMin + NanometersDelta * SrcX0 / SrcW
        NmEnd = NanometersMax - NanometersDelta * (1.0 - (SrcX0 + SrcDX - 1) / SrcW)
        ' ---------------------------------------------------------------------
        NmStartDiv = 10 * CInt(NmStart / 10.0F)
        ' ---------------------------------------------------------------------
        SetNmCoeff()
    End Sub

    Private Sub Spectrometer_SetDestParams()
        DestW = DestPbox.Image.Width
        DestH = DestPbox.Image.Height
        DestWidth = DestW - 1 - DestLeft
        DestRight = DestW - 1
        DestBottom = DestH
        SetNmCoeff()
    End Sub

    Friend Function Spectrometer_GetDestLeft() As Int32
        Return DestLeft
    End Function

    Private Sub SetNmCoeff()
        If NmEnd > NmStart Then
            NmCoeff = DestWidth / (NmEnd - NmStart)
        Else
            NmCoeff = 1
        End If
    End Sub


    ' ================================================================================
    '  PROCESS CAPTURED IMAGE  -  WEB CAM
    ' ================================================================================
    Private SrcImage As Image
    Private MaxImageValue As Single

    Friend Sub ProcessCapturedImage()
        ' -----------------------------------------------------------------------
        If Not Capture_NewImageIsReady Then Return
        'Dim t As PrecisionTimer = New PrecisionTimer
        ' ----------------------------------------------------------------------- LOAD CAPTURED IMAGE
        SrcImage = Capture_Image
        If SrcImage Is Nothing Then Return
        ' ----------------------------------------------------------------------- CAPTURE IMAGE NOT READY
        Capture_NewImageIsReady = False
        ' ----------------------------------------------------------------------- FLIP
        If Flip Then
            SrcImage.RotateFlip(RotateFlipType.RotateNoneFlipX)
            'SrcImage.RotateFlip(RotateFlipType.RotateNoneFlipXY)
        Else
            'SrcImage.RotateFlip(RotateFlipType.RotateNoneFlipNone)
            'SrcImage.RotateFlip(RotateFlipType.RotateNoneFlipY)
        End If
        ' ----------------------------------------------------------------------- SET PARAMS
        If SrcImage.Width <> SrcW Or SrcImage.Height <> SrcH Or SrcW <> SENSOR_NumSamples Then
            Spectrometer_SetSourceParams()
        End If
        ' ----------------------------------------------------------------------- Init arrays
        InitSpectrometerArraysIfChanged()
        ' ----------------------------------------------------------------------- EXTRACT SPECTRUM
        Bitmap_To_ReceivedSamples()
        ' ----------------------------------------------------------------------- ScaleCoeff_to65536
        ScaleCoeff_to65536 = 256
        ' ----------------------------------------------------------------------- ShowReceivedSamples
        Spectrometer_ShowReceivedSamples()
        ' ----------------------------------------------------------------------- ProcessReceivedSamples
        Spectrometer_ProcessReceivedSamples()
        ' ----------------------------------------------------------------------- SHOW MILLISECONDS
        'Debug.Print((t.GetTimeMicrosec / 1000.0F).ToString("0") + " mS")
    End Sub

    Private Sub Bitmap_To_ReceivedSamples()
        If SrcImage Is Nothing Then Return
        If Array_UpDownFiltered.Length = 0 Then Return
        Dim SrcBmp As Bitmap = CType(SrcImage, Bitmap)
        ' ----------------------------------------------------------------------- 
        Dim SourceData As BitmapData = SrcBmp.LockBits(New Rectangle(0, SrcY0, SrcW, SrcDY), _
                                                       ImageLockMode.ReadWrite, _
                                                       PixelFormat.Format24bppRgb)
        ' ----------------------------------------------------------------------- 
        Dim SourceStride As Int32 = SourceData.Stride
        Dim byteCount As Integer = (SourceData.Stride * SourceData.Height)
        Dim bmpBytes(byteCount - 1) As Byte
        Try
            Marshal.Copy(SourceData.Scan0, bmpBytes, 0, byteCount)
        Catch
        End Try
        SrcBmp.UnlockBits(SourceData)
        ' ----------------------------------------------------------------------- 
        MaxImageValue = 0
        Dim sumr As Int32 = 0
        Dim sumg As Int32 = 0
        Dim sumb As Int32 = 0
        Dim disp As Integer
        Dim v As Single
        For i As Int32 = 0 To SrcW - 1
            sumr = 0
            sumg = 0
            sumb = 0
            disp = i * 3
            For y As Int32 = 0 To SrcDY - 1
                sumr += bmpBytes(disp + 2)
                sumg += bmpBytes(disp + 1)
                sumb += bmpBytes(disp)
                disp = disp + SourceStride
            Next
            v = sumr * Kred + sumg * Kgreen + sumb * Kblue
            Array_ReceivedSamples(i) = v
            If v > MaxImageValue Then MaxImageValue = v
        Next
    End Sub


    ' ================================================================================
    '  LINEAR SENSOR (COM) to RECEIVED SAMPLES
    ' ================================================================================
    Private Sub InitAdcScaleAndScaleCoeff()
        AdcScale = CInt(2 ^ CInt(Val(Form1.Cmb_Scale.Text)))
        ScaleCoeff_to65536 = 65536 \ AdcScale
    End Sub

    Friend Sub LinearSensor_To_ReceivedSamples(ByVal Buffer() As Byte)
        '
        'Dim TestTimer As PrecisionTimer = New PrecisionTimer
        '
        ' -------------------------------------------------------------------------- Init arrays
        InitSpectrometerArraysIfChanged()
        ' -------------------------------------------------------------------------- Init AdcScale and ScaleCoeff_to_65536
        InitAdcScaleAndScaleCoeff()
        ' -------------------------------------------------------------------------- Init params
        FlipH = Form1.chk_FlipH.Checked
        FlipV = Form1.chk_FlipV.Checked
        Dim i, k As Int32
        Dim v As Single
        ReceivedValueMin = Single.MaxValue
        ReceivedValueMax = Single.MinValue
        ' -------------------------------------------------------------------------- Read all the samples
        For i = 0 To SENSOR_NumSamples - 1
            ' ---------------------------------------------------------------------- Read Low Byte
            v = Buffer(i * 2)
            ' ---------------------------------------------------------------------- Read High Byte
            v += 256 * Buffer(i * 2 + 1)
            ' ---------------------------------------------------------------------- FlipH
            If FlipH Then
                k = SENSOR_NumSamples - 1 - i
            Else
                k = i
            End If
            ' ---------------------------------------------------------------------- FlipV
            If FlipV Then
                v = AdcScale - v
            End If
            ' ---------------------------------------------------------------------- Received samples Min and Max
            If v < ReceivedValueMin Then ReceivedValueMin = v
            If v > ReceivedValueMax Then ReceivedValueMax = v
            ' ---------------------------------------------------------------------- Received samples array
            Array_ReceivedSamples(k) = v
        Next
        ' -------------------------------------------------------------------------- FLASH COM BUTTON
        Form1.FlashComArea()
        ' -------------------------------------------------------------------------- AUTO EXPOSURE
        Spectrometer_AutoExposure()
        ' -------------------------------------------------------------------------- ExposureTimeCountdownInit
        Form1.ExposureTimeCountdownInit()
        ' -------------------------------------------------------------------------- ShowReceivedSamples
        Spectrometer_ShowReceivedSamples()
        ' -------------------------------------------------------------------------- ProcessReceivedSamples
        Spectrometer_ProcessReceivedSamples()
        ' -------------------------------------------------------------------------- Restart timer
        FpsAndMillisecTimer.StartTimer()
        '
        'Debug.Print(TestTimer.GetTimeMillisec.ToString)
    End Sub


    ' ================================================================================
    '  SHOW RECEIVED SAMPLES
    ' ================================================================================
    Private GfxSamples As Graphics
    Private SamplesW As Int32
    Private SamplesH As Int32
    Private SamplesPen1 As Pen = New Pen(Color.FromArgb(200, 180, 0), 3)
    Private SamplesBrush1 As SolidBrush = New SolidBrush(Color.FromArgb(0, 180, 0))
    Private GrayBrush As SolidBrush = New SolidBrush(Color.FromArgb(210, 210, 210))
    Friend Samples_BorderLeft As Int32 = 45

    Friend Sub Spectrometer_ShowReceivedSamples()
        If SENSOR_Type = SensorTypes.WebCam Then
            If WebCamIsWorking Then
                Try
                    ' ----------------------------------------------------------------------- INIT GRAPHICS
                    If SrcImage Is Nothing Then Return
                    Dim SrcImg2 As Image = Nothing
                    ' ----------------------------------------------------------------------- AREA Y
                    Dim y As Int32 = SrcY0
                    Dim h As Int32 = CInt(SrcImage.Height * SrcDY / SrcImage.Height)
                    Dim rec As New Rectangle(0, y, SrcImage.Width, h)
                    ImageCropAndResize(SrcImg2, SrcImage, _
                                       SrcImage.Width, SrcImage.Height, rec, 1)

                    ' TODO IMAGE AGC
                    ' ----------------------------------------------------------------------- IMAGE AGC
                    Dim gain As Single = CSng(Math.Min(255 / MaxImageValue, 100))
                    ImageContrast(SrcImg2, gain)
                    ' ----------------------------------------------------------------------- CREATE GRAPHICS
                    Dim SrcGraphics As Graphics = Graphics.FromImage(SrcImg2)
                    ' ----------------------------------------------------------------------- SHOW AREA
                    Dim size As Double = Capture_Image.Width / Form1.PBox_Samples.Width * 8
                    If size > 18 Then size = 18
                    Dim SrcPen As Pen = New Pen(Color.FromArgb(200, 120, 0), CSng(size))
                    SrcGraphics.DrawRectangle(SrcPen, SrcX0, 0, SrcDX, SrcImage.Height - 8)
                    ' ----------------------------------------------------------------------- SHOW SOURCE IMAGE
                    Form1.PBox_Samples.Image = SrcImg2
                    ' ----------------------------------------------------------------------- IMAGE INFO
                    Form1.Label_WebCamResolution.Text = Capture_Image.Width.ToString & _
                                                      " x " & Capture_Image.Height.ToString
                    Form1.Label_WebCamFPS.Text = Capture_FramesPerSecond.ToString("0") & " fps"
                Catch
                    Capture_STOP()
                    SrcImage.Dispose()
                    Capture_START()
                End Try
            Else
                Form1.PBox_Samples.Image = Nothing
            End If
        Else
            If Form1.WindowState = FormWindowState.Minimized Then Return
            If SrcW = 0 Then Return
            If Array_ReceivedSamples.Length = 0 Then Return
            ' -------------------------------------------------------------------- 
            InitAdcScaleAndScaleCoeff()
            ' -------------------------------------------------------------------- INIT
            InitPictureboxImage(Form1.PBox_Samples)
            With Form1.PBox_Samples
                If .Image Is Nothing Then Return
                If .Image.Width <> SamplesW Or .Image.Height <> SamplesH Then
                    SamplesW = .Image.Width - Samples_BorderLeft - 3
                    SamplesH = .Image.Height - 3
                    GfxSamples = Graphics.FromImage(.Image)
                End If
            End With
            Dim kw As Single = CSng(SamplesW / SrcW)
            ' --------------------------------------------------------------------- CLEAR
            GfxSamples.Clear(Color.WhiteSmoke)
            Dim oldx As Single = -1
            Dim oldy As Single = -1
            Dim x, y As Single
            ' --------------------------------------------------------------------- Gray area
            y = SamplesH * (AdcScale - Form1.txt_AdcMax.NumericValueInteger) / 1000.0F
            GfxSamples.FillRectangle(GrayBrush, Samples_BorderLeft, 0, SamplesW, y)
            y = SamplesH * Form1.txt_AdcMin.NumericValueInteger / 1000.0F
            GfxSamples.FillRectangle(GrayBrush, Samples_BorderLeft, SamplesH - y, SamplesW, y)
            ' --------------------------------------------------------------------- Scale divisions
            For i As Int32 = 0 To 100 Step 10
                y = SamplesH - i / 100.0F * SamplesH
                GfxSamples.DrawLine(ScalePen3, Samples_BorderLeft, y, Samples_BorderLeft + SamplesW, y)
            Next
            For i As Int32 = 0 To 100 Step 5
                x = Samples_BorderLeft + i / 100.0F * SamplesW
                GfxSamples.DrawLine(ScalePen3, x, 0, x, SamplesH)
            Next
            ' --------------------------------------------------------------------- SHOW SAMPLES
            For i As Int32 = 0 To Array_ReceivedSamples.Length - 1
                x = Samples_BorderLeft + kw * i
                y = SamplesH * Array_ReceivedSamples(i) / AdcScale
                y = SamplesH - y
                GfxSamples.FillRectangle(SamplesBrush1, oldx - 1, oldy - 1, 3, 3)
                oldx = x
                oldy = y
            Next
            ' --------------------------------------------------------------------- SHOW AREA
            Dim x0 As Single = CSng(Calib_NmToBin(NmStart))
            Dim x1 As Single = CSng(Calib_NmToBin(NmEnd))
            GfxSamples.DrawRectangle(SamplesPen1, _
                                     Samples_BorderLeft + 1 + x0 * kw, 1, _
                                     (x1 - x0) * kw, _
                                     SamplesH)
            ' --------------------------------------------------------------------- SCALE values
            GfxSamples.DrawString(AdcScale.ToString, ScaleFontBold, Brushes.DarkBlue, 2, 2)
            GfxSamples.DrawString("0", ScaleFontBold, Brushes.DarkBlue, 2, SamplesH - 14)
            ' --------------------------------------------------------------------- Print MIN and MAX
            GfxSamples.DrawString(ReceivedValueMax.ToString, ScaleFontBold, Brushes.DarkBlue, 2, 22)
            GfxSamples.DrawString(ReceivedValueMin.ToString, ScaleFontBold, Brushes.DarkBlue, 2, SamplesH - 40)
            ' ---------------------------------------------------------------------
            Form1.PBox_Samples.Refresh()
            ' --------------------------------------------------------------------- IMAGE INFO
            Static SmoothMillisec As Double = 100
            Dim k As Double = SmoothMillisec * 0.002
            If k > 100 Then k = 100
            If k < 0.001 Then k = 0.001
            SmoothValue_Pow_Adaptive(SmoothMillisec, FpsAndMillisecTimer.GetTimeMillisec, k)
            Form1.Label_FramesPerSec.Text = (1000 / SmoothMillisec).ToString("0.0", GCI) + " fps"
            Form1.Label_Resolution.Text = SENSOR_NumSamples.ToString + " smp"
        End If
    End Sub


    ' ================================================================================
    '  PROCESS RECEIVED SAMPLES
    ' ================================================================================
    Friend Sub Spectrometer_ProcessReceivedSamples()

        ' TODO IRRADIANCE 1
        ' -------------------------------------------------------------------------- Correct for Irradiance
        CorrectForIrradiance(Array_ReceivedSamples)

        ' -------------------------------------------------------------------------- Add AVERAGE
        Dim i As Int32
        Dim v As Single
        For i = 0 To SENSOR_NumSamples - 1
            v = Array_ReceivedSamples(i)
            ' ---------------------------------------------------------------------- Scale always 0 to 65535
            v = v * ScaleCoeff_to65536
            ' ---------------------------------------------------------------------- Update Array_AverageFiltered
            If AverageEnabled And AverageCounter > 1 Then
                Array_AverageFiltered(i) += v
            Else
                Array_AverageFiltered(i) = v
            End If
        Next
        ' -------------------------------------------------------------------------- ADC MIN Auto
        If SENSOR_Type = SensorTypes.WebCam Then
            ValueMinSubtractor = 0
        Else
            If Form1.chk_AdcMinAuto.Checked And Not Form1.chk_Average.Checked Then
                EventsAreEnabled = False
                Form1.txt_AdcMin.NumericValueInteger = Math.Min(CInt(ReceivedValueMin), Form1.txt_AdcMax.NumericValueInteger - AdcScale \ 8)
                EventsAreEnabled = True
                ValueMinSubtractor = ReceivedValueMin * ScaleCoeff_to65536
            Else
                ValueMinSubtractor = Form1.txt_AdcMin.NumericValueInteger * ScaleCoeff_to65536
            End If
        End If
        ' -------------------------------------------------------------------------- Average / MinDisplayValue / SpeedUP and SpeedDW
        For i = 0 To SENSOR_NumSamples - 1
            ' ---------------------------------------------------------------------- AveragedValue / AverageCounter
            v = Array_AverageFiltered(i) / AverageCounter
            ' ---------------------------------------------------------------------- Subtract ValueMinSubtractor
            v -= ValueMinSubtractor
            If v < 0 Then v = 0
            ' ---------------------------------------------------------------------- SpeedUP and SpeedDW
            If v > Array_UpDownFiltered(i) Then
                Array_UpDownFiltered(i) += (v - Array_UpDownFiltered(i)) * KSpeedUP
            Else
                Array_UpDownFiltered(i) += (v - Array_UpDownFiltered(i)) * KSpeedDW
            End If
        Next
        ' -------------------------------------------------------------------------- Show SPECTRUM GRAPH 
        ShowSpectrumGraph()
        ' -------------------------------------------------------------------------- Update AVERAGE COUNTER
        Spectrometer_AverageCounter()
        ' -------------------------------------------------------------------------- AUTOSAVE UPDATE
        Form1.Autosave_UpdateFromReceivedSamples()
    End Sub

    ' ================================================================================
    '  AUTO EXPOSURE
    ' ================================================================================
    Friend AutoExposureEnabled As Boolean = False

    Friend Sub Spectrometer_AutoExposure()
        ' ---------------------------------------------------------------------
        If Not AutoExposureEnabled Then Return
        If Not COM_IsOpen() Then Return
        ' --------------------------------------------------------------------- Value Max and AdcMax
        Dim max As Single = ReceivedValueMax
        Dim TripPointMax As Single = Form1.txt_AdcMax.NumericValueInteger
        Dim TripPointMin As Single = TripPointMax * 0.75F
        ' --------------------------------------------------------------------- test and increment exposure
        Static FindMax As Boolean = False
        If max < TripPointMin Then
            FindMax = True
        End If
        If FindMax Then
            If max < TripPointMax Then
                If Form1.Cmb_ExposureTime.SelectedIndex < 75 Then ' 75=1sec / 79=2sec / 81=3sec
                    Form1.Cmb_ExposureTime.SelectedIndex += 1
                End If
            Else
                FindMax = False
            End If
        End If
        ' --------------------------------------------------------------------- test and decrement exposure
        If max > TripPointMax Then
            If Form1.Cmb_ExposureTime.SelectedIndex > 0 Then
                Form1.Cmb_ExposureTime.SelectedIndex -= 1
            End If
        End If
    End Sub

    ' ================================================================================
    '  UPDATE AVERAGE COUNTER
    ' ================================================================================
    Friend AverageEnabled As Boolean = False
    Friend AverageCounter As Int32 = 1
    Friend AverageNumber As Int32 = Int32.MaxValue

    Friend Sub Spectrometer_AverageCounter()
        If AverageEnabled Then
            AverageCounter += 1
            If AverageCounter > AverageNumber Then
                PlaySound_Success2_Wait()
                SaveSpectrumToFile_WithIncrementedIndex()
                AverageCounter = 1
                If Not Form1.Tools_Repeat.Checked Then
                    Form1.CloseComm()
                    AverageEnabled = False
                End If
            End If
            Form1.UpdateAverageLabel()
        End If
    End Sub

    ' ================================================================================
    '  ADD REMOVE CALIBRATION
    ' ================================================================================
    Private Sub Array_UpDownFiltered_To_Array_Calibrated()
        ReDim Array_Calibrated(Array_UpDownFiltered.Length - 1)
        For i As Int32 = 0 To Array_UpDownFiltered.Length - 1
            Dim nm As Double = NanometersMin + (NanometersMax - NanometersMin) * i / Array_UpDownFiltered.Length
            Dim bin As Int32 = CInt(Calib_NmToBin(nm))
            If bin < 0 Then bin = 0
            If bin > Array_UpDownFiltered.Length - 1 Then bin = Array_UpDownFiltered.Length - 1
            Array_Calibrated(i) = Array_UpDownFiltered(bin)
        Next
    End Sub


    Dim MaxReferenceValue As Single
    ' ================================================================================
    '  Add_SpatialFilter --- Array_Calibrated TO Array_SpatialFiltered
    ' ================================================================================
    Private Sub Add_SpatialFilter()
        Dim v, vnew As Single
        For i As Int32 = 0 To Array_Calibrated.Length - 1
            vnew = Array_Calibrated(i)
            ' ----------------------------------------- SPATIAL FILTER
            v += (vnew - v) * KFilter
            ' ----------------------------------------- Left to Right filter pass
            Array_SpatialFiltered(i) = v / 2.0F
        Next
        For i As Int32 = Array_Calibrated.Length - 1 To 0 Step -1
            vnew = Array_Calibrated(i)
            ' ----------------------------------------- SPATIAL FILTER
            v += (vnew - v) * KFilter
            ' ----------------------------------------- Right to Left filter pass
            Array_SpatialFiltered(i) += v / 2.0F
        Next
    End Sub

    ' ================================================================================
    '  BACKGROUND - SET RESET
    ' ================================================================================
    Private Background(-1) As Single
    Friend Sub Spectrometer_SetBackground()
        Background = CType(Array_SpatialFiltered.Clone, Single())
    End Sub
    Friend Sub Spectrometer_ResetBackground()
        Form1.btn_Background.Checked = False
        ReDim Background(-1)
    End Sub
    Private Sub AddBackground()
        Dim v As Single
        If Background.Length > 0 Then
            For i As Int32 = 0 To Math.Min(Array_SpatialFiltered.Length, Background.Length) - 1
                v = Array_SpatialFiltered(i)
                ' ----------------------------------------------- background
                v = v - Background(i)
                If v < 0 Then v = 0
                ' ----------------------------------------------- store value
                Array_SpatialFiltered(i) = v
            Next
        End If
    End Sub

    ' ================================================================================
    '  REFERENCE - SET RESET
    ' ================================================================================
    Private Reference(-1) As Single
    Friend Sub Spectrometer_SetReference()
        Reference = CType(Array_SpatialFiltered.Clone, Single())
        For i As Int32 = 0 To SENSOR_NumSamples - 1
            If Reference(i) < 200 Then Reference(i) = 99999
        Next
    End Sub
    Friend Sub Spectrometer_ResetReference()
        Form1.btn_Reference.Checked = False
        ReDim Reference(-1)
    End Sub
    Private Sub AddReference()
        Dim v As Single
        If Reference.Length > 0 Then
            MaxReferenceValue = 0.1
            For i As Int32 = 0 To Array_VisibleSamples.Length - 1
                v = Array_SpatialFiltered(i + SrcX0)
                If v > MaxReferenceValue Then MaxReferenceValue = v
            Next
            For i As Int32 = 0 To Math.Min(Array_SpatialFiltered.Length, Reference.Length) - 1
                v = Array_SpatialFiltered(i)
                ' ----------------------------------------------- reference
                'v = v * 0.5F * MaxReferenceValue
                v = v * MaxReferenceValue
                If Reference(i) > 0 Then v /= Reference(i)
                ' ----------------------------------------------- store value
                Array_SpatialFiltered(i) = v
            Next
        End If
    End Sub

    ' ================================================================================
    '  Prepare_VisibleSamples --- Array_SpatialFiltered TO Array_VisibleSamples
    ' ================================================================================
    Private Sub Prepare_VisibleSamples()
        ' -----------------------------------------------------------
        If Array_SpatialFiltered.Length = 0 Then Return
        ' ----------------------------------------------------------- Add SPATIAL FILTER
        Add_SpatialFilter()
        ' ----------------------------------------------------------- ADD BACKGROUND
        AddBackground()
        ' ----------------------------------------------------------- ADD REFERENCE
        AddReference()
        ' ----------------------------------------------------------- FILL VISIBLE ARRAY
        MaxPeakValue = 0.1
        Dim n As Int32 = Array_VisibleSamples.Length
        n = Math.Min(n, Array_SpatialFiltered.Length - SrcX0)
        For i As Int32 = 0 To n - 1
            ' ------------------------------------------------------- Fill
            Array_VisibleSamples(i) = Array_SpatialFiltered(i + SrcX0)
            ' ------------------------------------------------------- Update max
            If Array_VisibleSamples(i) > MaxPeakValue Then
                MaxPeakValue = Array_VisibleSamples(i)
                MaxPeakValue_Index = i
            End If
        Next
        ' ----------------------------------------------------------- LIMIT NOISE AMPLIFICATION TO 1000
        MaxVisibleValue = MaxPeakValue
        If MaxVisibleValue < 1000 Then MaxVisibleValue = 1000
    End Sub

    ' ================================================================================
    '  SHOW SPECTRUM GRAPH
    ' ================================================================================
    Friend Sub ShowSpectrumGraph()
        ' -------------------------------------------------------------------------- ADD CALIBRATION
        Array_UpDownFiltered_To_Array_Calibrated()
        ' ---------------------------------------------------------------------
        Prepare_VisibleSamples()
        If Array_VisibleSamples.Length < 10 Then Return
        ' ---------------------------------------------------------------------
        InitPictureboxImage(DestPbox)
        If DestPbox.Image Is Nothing Then Return
        If DestPbox.Image.Width <> DestW Or DestPbox.Image.Height <> DestH Then
            Spectrometer_SetDestParams()
            gfx = Graphics.FromImage(DestPbox.Image)
        End If
        ' ---------------------------------------------------------------------
        gfx.Clear(Color.AliceBlue)
        If MaxVisibleValue = 0 Then Return
        Dim x As Single
        Dim y As Single
        Dim drawText As Boolean
        ' --------------------------------------------------------------------- scale X
        If NmCoeff > 40 Then
            For i As Single = NmStartDiv - 10 To CInt(NmEnd + 1) Step 0.1
                x = CSng(DestLeft + (i - NmStart) * NmCoeff)
                gfx.DrawLine(ScalePen5, x, 15, x, DestBottom)
            Next
        End If
        For i As Int32 = NmStartDiv - 10 To CInt(NmEnd) Step 1
            drawText = False
            x = CSng(DestLeft + (i - NmStart) * NmCoeff)
            If x < DestLeft Then Continue For
            If i Mod 100 = 0 Then
                gfx.DrawLine(ScalePen1, x, 15, x, DestBottom)
                drawText = True
            ElseIf i Mod 50 = 0 Then
                If NmCoeff > 1 Then gfx.DrawLine(ScalePen2, x, 15, x, DestBottom)
                If NmCoeff > 2 Then drawText = True
            ElseIf i Mod 10 = 0 Then
                If NmCoeff > 2 Then gfx.DrawLine(ScalePen3, x, 15, x, DestBottom)
                If NmCoeff > 5 Then drawText = True
            Else
                If NmCoeff > 20 Then gfx.DrawLine(ScalePen4, x, 15, x, DestBottom)
                If NmCoeff > 50 Then drawText = True
            End If
            If drawText Then
                gfx.DrawString(i.ToString, ScaleFont, Brushes.Black, x - 4, 1)
            End If
        Next
        ' --------------------------------------------------------------------- scale Y
        For i As Int32 = 0 To 100 Step 5
            y = DestBottom - i / 100.0F * (DestBottom - 15)
            If i = 100 Then
                gfx.DrawLine(ScalePen1, DestLeft, y, DestRight, y)
            ElseIf i Mod 10 = 0 Then
                gfx.DrawLine(ScalePen2, DestLeft, y, DestRight, y)
            Else
                gfx.DrawLine(ScalePen3, DestLeft, y, DestRight, y)
            End If
        Next
        ' --------------------------------------------------------------------- scale y text
        For i As Int32 = 10 To 100 Step 10
            Dim s As String
            y = DestBottom - i / 100.0F * (DestBottom - 15)
            Dim v As Double = Y_To_Value(y)
            If v >= 100000 Then
                s = (v / 1000).ToString("0") + "K"
            Else
                s = v.ToString("0")
            End If
            Dim w As Single = gfx.MeasureString(s, ScaleFont).Width
            gfx.DrawString(s, ScaleFont, Brushes.Black, 35 - w, y - 5)
        Next
        ' --------------------------------------------------------------------- scale borders
        gfx.DrawLine(ScalePen1, DestLeft, 15, DestLeft, DestBottom)
        ' --------------------------------------------------------------------- graph vars
        kx = CSng(DestWidth) / (Array_VisibleSamples.Length - 1)
        ky = (DestBottom - 15) / MaxVisibleValue
        ' --------------------------------------------------------------------- graph color fill
        Dim xnew As Int32 = DestLeft
        Dim xold As Int32 = DestLeft
        Dim x3 As Int32
        Dim y1 As Single
        Dim y2 As Single
        If UseColors Then
            For i As Int32 = 1 To Array_VisibleSamples.Length - 1
                xnew = CInt(BinToX(i))
                If xnew = xold + 1 Then
                    y = Y_From_Value(Array_VisibleSamples(i))
                    If y > 2 Then
                        Pen_Graph.Color = WavelengthToColor(X_To_Nanometers(xnew))
                        gfx.DrawLine(Pen_Graph, xnew, DestBottom, xnew, y)
                    End If
                ElseIf xnew > xold Then
                    Pen_Graph.Color = WavelengthToColor(X_To_Nanometers(xnew))
                    y1 = Y_From_Value(Array_VisibleSamples(i - 1))
                    y2 = Y_From_Value(Array_VisibleSamples(i))
                    If y1 > 2 Or y2 > 2 Then
                        For x3 = xold + 1 To xnew
                            y = y1 + (y2 - y1) * (x3 - xold) / (xnew - xold)
                            gfx.DrawLine(Pen_Graph, x3, DestBottom, x3, y)
                        Next
                    End If
                End If
                xold = xnew
            Next
        End If
        ' --------------------------------------------------------------------- graph black line
        Dim oldx As Single = DestLeft
        Dim oldy As Single = 0
        Pen_Graph.Color = Color.FromArgb(0, 70, 0)
        For i As Int32 = 0 To Array_VisibleSamples.Length - 1
            x = CSng(BinToX(i))
            y = Y_From_Value(Array_VisibleSamples(i))
            If x > DestLeft Then
                gfx.DrawLine(Pen_Graph, oldx, oldy, x, y)
                'gfx.DrawLine(Pen_Graph, oldx + 1, oldy, x + 1, y) ' thick line
                If x - oldx > 2 Then
                    gfx.DrawRectangle(Pen_Graph, x - 1, y - 1, 3, 3) ' points
                End If
            End If
            oldx = x
            oldy = y
        Next
        ' ---------------------------------------------------------------------- STATUS BAR INDICATIONS
        If CursorInside Then
            PrintValueAndNanometers()
        Else
            Spectrometer_PrintMaxValueAndNanometers()
        End If
        ' --------------------------------------------------------------------- 
        MarkTrimPoints()
        ' --------------------------------------------------------------------- 
        MarkAllPeaks()
        ' ---------------------------------------------------------------------
        CalculatePeakArea()
        ' --------------------------------------------------------------------- 
        DestPbox.Refresh()
    End Sub


    ' TODO Spectrometer_PrintMaxValueAndNanometers
    ' ================================================================================
    '  PrintValueAndNanometers
    ' ================================================================================
    Friend Sub PrintValueAndNanometers()
        Dim nm As Double = X_To_Nanometers(CursorX)
        Dim value As Double = Y_To_Value(CursorY)
        Form1.Label_MaxPeak.BorderStyle = BorderStyle.None
        Form1.Label_MaxPeak.BackColor = Color.Transparent
        Form1.Label_MaxPeak.Text = "Value " + value.ToString("0") + _
                                   " @ " + nm.ToString("0.0", GCI) + " nm" + _
                                   "  Peak area " + PeakAreaToString()
    End Sub

    Friend Sub Spectrometer_PrintMaxValueAndNanometers()
        Dim nm As Double = X_To_Nanometers((MaxPeakValue_Index * DestW) \ SrcDX)
        Form1.Label_MaxPeak.BorderStyle = BorderStyle.None
        Form1.Label_MaxPeak.BackColor = Color.Transparent
        Form1.Label_MaxPeak.Text = "Max " + MaxPeakValue.ToString("0") + _
                                   " @ " + nm.ToString("0.0", GCI) + " nm" + _
                                   "  Peak area " + PeakAreaToString()
    End Sub


    ' ================================================================================
    '  VISUALIZATION Y-TO-VALUE functions
    ' ================================================================================
    Friend Function Y_To_Value(ByVal y As Double) As Double
        '
        Dim p As Double
        Dim h As Int32 = DestH - 15
        '
        If LogScale <> 1 Then
            y = (DestH - y) / h
            y = y ^ (1 / LogScale)
            y = DestH - y * h
        End If
        '
        p = ((h - y + 15) * 100 / h)
        If p > 100 Then p = 100
        '
        Return p * MaxVisibleValue / 100.0
    End Function

    Friend Function Y_From_Value(ByVal value As Double) As Single
        Dim p, y As Double
        Dim h As Int32 = DestH - 15
        p = value * 100 / MaxVisibleValue
        '
        y = h - ((p * h) / 100) + 15
        '
        If LogScale <> 1 Then
            y = (DestH - y) / h
            y = y ^ LogScale
            y = DestH - y * h
        End If
        Return CSng(y)
    End Function

    ' ================================================================================
    '  VISUALIZATION - NANOMETER and BIN functions
    ' --------------------------------------------------------------------------------
    '  FUNCTIONS VALID FOR THE VISIBLE-ARRAY ONLY
    '  - BIN ZERO is the first visible bin
    '  -   X ZERO is the first pixel of the visible window
    ' ================================================================================
    Friend Function X_To_Nanometers(ByVal x As Double) As Double
        If NmCoeff = 0 Then Return 0
        Return NmStart + (x - DestLeft) / NmCoeff
    End Function

    Friend Function Nanometers_To_X(ByVal nm As Double) As Double
        Return DestLeft + (nm - NmStart) * NmCoeff
    End Function

    Friend Function BinToX(ByVal bin As Double) As Double
        Return CInt(DestLeft + bin * kx)
    End Function

    Friend Function XtoBin(ByVal x As Double) As Double
        If kx = 0 Then Return 0
        Return CInt((x - DestLeft) / kx)
    End Function


    ' TODO - CalculatePeakArea
    ' =======================================================================================================
    '   CalculatePeakArea
    ' =======================================================================================================
    Dim PeakArea As Double

    Friend Sub CalculatePeakArea()
        Dim Area As Double = 0
        Dim nm1 As Double
        Dim nm2 As Double
        Dim BaseWidth As Double
        Dim AverageHeight As Double
        For i As Int32 = 0 To Array_VisibleSamples.Length - 2
            nm1 = X_To_Nanometers(BinToX(i))
            nm2 = X_To_Nanometers(BinToX(i + 1))
            BaseWidth = nm2 - nm1
            AverageHeight = (Array_VisibleSamples(i) + Array_VisibleSamples(i + 1)) / 2
            Area += baseWidth * averageHeight
        Next
        SmoothValue_Pow_Adaptive(PeakArea, Area, 1)
    End Sub

    Friend Function PeakAreaToString() As String
        If PeakArea >= 100000 Then
            Return (PeakArea / 1000).ToString("0 K", GCI)
        ElseIf PeakArea >= 10000 Then
            Return (PeakArea / 1000).ToString("0.0 K", GCI)
        ElseIf PeakArea >= 1000 Then
            Return PeakArea.ToString("0", GCI)
        Else
            Return PeakArea.ToString("0.0", GCI)
        End If
    End Function


    ' ================================================================================
    '  MARK TRIM POINTS
    ' ================================================================================
    Private Font_Peaks As Font = New Font("Arial", 9)
    Private Pen_Trim1 As Pen = New Pen(Color.White)

    Private Sub MarkTrimPoint(ByVal nm As Double, ByVal bin As Double)
        Pen_Trim1.DashStyle = DashStyle.Dot
        Dim x As Single
        Dim w As Int32 = 26
        x = CSng(Nanometers_To_X(Calib_BinToNm(bin)))
        ' ---------------------------------------------------------
        If x >= DestLeft And x <= DestW + 5 Then
            Dim s As String = nm.ToString("0")
            If s.Length > 3 Then w = 34
            ' -----------------------------------------------------
            gfx.DrawLine(Pens.Black, x, 16, x, DestH)
            gfx.DrawLine(Pen_Trim1, x, 16, x, DestH)
            ' -----------------------------------------------------
            If x < DestLeft + w \ 2 - 2 Then x = DestLeft + w \ 2 - 2
            If x > DestW - w \ 2 + 2 Then x = DestW - w \ 2 + 2
            gfx.FillRectangle(Brushes.Yellow, x - 14, 0, w, 14)
            gfx.DrawRectangle(Pens.Red, x - 14, 0, w, 14)
            gfx.DrawString(s, Font_Peaks, Brushes.Black, x - 13, 0)
        End If
    End Sub

    Private Sub MarkTrimPoints()
        If Not TrimScale Then Return
        For i As Int32 = 0 To Calib_BIN.Length - 1
            MarkTrimPoint(Calib_NM(i), Calib_BIN(i))
        Next
    End Sub


    ' ================================================================================
    '  MARK PEAKS
    ' ================================================================================
    Private Sub MarkAllPeaks()
        If Not ShowPeaks And Not ShowDips Then Return
        Dim delta As Int32 = (20 * SrcDX) \ DestW
        If delta < 2 Then delta = 2
        Dim v As Single
        Dim valid As Boolean
        For i As Int32 = delta To Array_VisibleSamples.Length - delta - 1
            v = Array_VisibleSamples(i)
            If ShowPeaks Then
                If v >= Array_VisibleSamples(i + 1) AndAlso _
                   v > Array_VisibleSamples(i - 1) AndAlso _
                   v * 100 > MaxVisibleValue Then
                    valid = True
                    For d As Int32 = 2 To delta
                        If v < Array_VisibleSamples(i + d) OrElse v < Array_VisibleSamples(i - d) Then
                            valid = False
                            Exit For
                        End If
                    Next
                    If valid Then MarkPeak(i, True)
                End If
            End If
            If ShowDips Then
                If v < Array_VisibleSamples(i + 1) AndAlso _
                   v < Array_VisibleSamples(i - 1) AndAlso _
                   v * 10000000 > MaxVisibleValue Then
                    valid = True
                    For d As Int32 = 2 To delta
                        If v > Array_VisibleSamples(i + d) OrElse v > Array_VisibleSamples(i - d) Then
                            valid = False
                            Exit For
                        End If
                    Next
                    If valid Then MarkPeak(i, False)
                End If
            End If
        Next
        ' ------------------------------------------------------------------------ Show Clipboard Label
        ShowClipboardLabel()
    End Sub

    Friend MouseEventOnPboxSpectrum As Boolean = False

    Private Sub MarkPeak(ByVal bin As Int32, ByVal IsPeak As Boolean)
        Dim x As Single
        Dim y1 As Int32
        Dim y2 As Int32
        Dim w As Int32
        If bin > 0 Then
            x = CSng(BinToX(bin))
            If x >= 0 And x < DestW Then
                y1 = 15 + CInt((DestH - 15) * (1 - Array_VisibleSamples(bin) / MaxVisibleValue))
                If IsPeak Then
                    y2 = y1 - 20
                    If y2 < DestH - 50 Then y2 = DestH - 20
                    gfx.DrawLine(Pens.Red, x, y1 + 1, x, DestH)
                Else
                    y2 = 30
                    gfx.DrawLine(Pens.Green, x, 40, x, y1 - 3)
                End If
                Dim s As String
                If NmCoeff > 50 Then
                    s = X_To_Nanometers(x).ToString("0.00", GCI)
                Else
                    s = X_To_Nanometers(x).ToString("0")
                End If
                w = 26
                If s.Length > 3 Then w = 30
                If s.Length > 4 Then w = 37
                If s.Length > 5 Then w = 44
                gfx.FillRectangle(Brushes.Yellow, x - 14, y2, w, 14)
                gfx.DrawRectangle(Pens.Green, x - 14, y2, w, 14)
                gfx.DrawString(s, Font_Peaks, Brushes.Black, x - 13, y2)
                If NmCoeff > 50 Then
                    If y2 > DestH \ 2 Then
                        y2 = y2 - 16
                    Else
                        y2 = y2 + 16
                    End If
                    s = Array_VisibleSamples(bin).ToString("0")
                    w = 26
                    If s.Length > 3 Then w = 34
                    If s.Length > 4 Then w = 41
                    gfx.FillRectangle(Brushes.Yellow, x - 14, y2, w, 14)
                    gfx.DrawRectangle(Pens.Green, x - 14, y2, w, 14)
                    gfx.DrawString(s, Font_Peaks, Brushes.Black, x - 13, y2)
                End If
                ' ------------------------------------------------------------------------ Test Mouse on labels
                If Form.ActiveForm Is Form1 And MouseEventOnPboxSpectrum Then
                    MouseOnLabels(x, y2, bin)
                End If
            End If
        End If
    End Sub

    Private Sub MouseOnLabels(ByVal x As Single, ByVal y As Single, ByVal bin As Int32)
        If Control.MouseButtons = Windows.Forms.MouseButtons.Left Then
            Dim p As Point = Form1.PBox_Spectrum.PointToClient(Cursor.Position)
            If Math.Abs(p.X - x) < 20 And Math.Abs(p.Y - y) < 30 Then
                ' ------------------------------------------------------------------ Add ClipBoard Data
                PlaySound_Success()
                Dim s As String = Array_VisibleSamples(bin).ToString("00000")
                s += "  " + X_To_Nanometers(x).ToString("0.00", GCI)
                AddClipBoardData(s)
                MouseEventOnPboxSpectrum = False
                ' ------------------------------------------------------------------ Prepare ClipBoard Data
                If x + 80 > gfx.VisibleClipBounds.Width Then
                    x = gfx.VisibleClipBounds.Width - 80
                End If
                If y > gfx.VisibleClipBounds.Height / 2 Then
                    y -= 130
                Else
                    y += 20
                End If
                ClipboardLabel_X = x - 14
                ClipboardLabel_Y = y
                ClipboardLabel_String = ClipBoardData
            End If
        Else
            ClipboardLabel_String = ""
            MouseEventOnPboxSpectrum = False
        End If
    End Sub

    Private ClipBoardDataFiFo As Collections.Generic.Queue(Of String) = New Collections.Generic.Queue(Of String)
    Private ClipBoardData As String = ""

    Private Sub AddClipBoardData(ByVal s As String)
        s += vbCrLf
        If Not (ClipBoardDataFiFo.Count > 0 AndAlso ClipBoardDataFiFo.ElementAt(ClipBoardDataFiFo.Count - 1) = s) Then
            ClipBoardDataFiFo.Enqueue(s)
        End If
        If ClipBoardDataFiFo.Count > 7 Then
            ClipBoardDataFiFo.Dequeue()
        End If
        ClipBoardData = String.Concat(ClipBoardDataFiFo.ToArray())
        Clipboard.SetData(System.Windows.Forms.DataFormats.Text, ClipBoardData)
    End Sub

    Friend Sub ResetClipBoardData()
        ClipBoardDataFiFo.Clear()
    End Sub

    Private ClipboardLabel_X As Single
    Private ClipboardLabel_Y As Single
    Private ClipboardLabel_String As String

    Private Sub ShowClipboardLabel()
        If ClipboardLabel_String = "" Then Return
        Dim w As Int32 = 90
        Dim h As Int32 = 120
        gfx.FillRectangle(Brushes.LightYellow, ClipboardLabel_X, ClipboardLabel_Y, w, h)
        gfx.DrawRectangle(Pens.Green, ClipboardLabel_X, ClipboardLabel_Y, w, h)
        gfx.DrawString("Clipboard data", Font_Peaks, Brushes.Black, ClipboardLabel_X + 1, ClipboardLabel_Y + 4)
        gfx.DrawString(ClipboardLabel_String, Font_Peaks, Brushes.Black, ClipboardLabel_X + 2, ClipboardLabel_Y + 22)
    End Sub

    ' ======================================================================================
    '  SAVE SPECTRUM FILE
    ' ======================================================================================
    Friend SpectrumFileSeparator As String = ";"
    Friend SpectrumFileType As String = "CSV"

    Friend Function GetSpectrumText() As String
        Dim s As String = "Sensor;" + SENSOR_Type.ToString + vbCrLf
        s += "-----------------------" + vbCrLf

        If SENSOR_Type = SensorTypes.WebCam Then
            s += "Rec.Samples" + SpectrumFileSeparator + Form1.Label_WebCamResolution.Text + vbCrLf
            s += "FramesPerSec" + SpectrumFileSeparator + Form1.Label_WebCamFPS.Text + vbCrLf
            '
            s += "Exposure" + SpectrumFileSeparator + DecodeExposureTimes(Form_VideoInControls.Label_Exposure.Text) + vbCrLf
            s += "Gain" + SpectrumFileSeparator + Form_VideoInControls.Label_Gain.Text + vbCrLf
            s += "Brightness" + SpectrumFileSeparator + Form_VideoInControls.Label_Brightness.Text + vbCrLf
            s += "Contrast" + SpectrumFileSeparator + Form_VideoInControls.Label_Contrast.Text + vbCrLf
            s += "Gamma" + SpectrumFileSeparator + Form_VideoInControls.Label_Gamma.Text + vbCrLf
            '
        Else
            s += "ReceivedSamples" + SpectrumFileSeparator + Form1.Label_Resolution.Text + vbCrLf
            s += "FramesPerSec" + SpectrumFileSeparator + Form1.Label_FramesPerSec.Text + vbCrLf
            '
            s += "Exposure" + SpectrumFileSeparator + Form1.Cmb_ExposureTime.Text + vbCrLf
            '
            s += "Samples" + SpectrumFileSeparator + Form1.Cmb_Resolution.Text.Trim + vbCrLf
            s += "AdcSpeed" + SpectrumFileSeparator + Form1.Cmb_AdcSpeed.Text + vbCrLf
            '
            s += "Mode" + SpectrumFileSeparator + Form1.Cmb_DebugType.Text + vbCrLf
            s += "AdcScale" + SpectrumFileSeparator + Form1.Cmb_Scale.Text + vbCrLf
            '
            s += "AdcMax" + SpectrumFileSeparator + Form1.txt_AdcMax.Text + vbCrLf
            s += "AdcMin" + SpectrumFileSeparator + Form1.txt_AdcMin.Text + vbCrLf
            '
            s += "ReceivedValueMax" + SpectrumFileSeparator + ReceivedValueMax.ToString + vbCrLf
            s += "ReceivedValueMin" + SpectrumFileSeparator + ReceivedValueMin.ToString + vbCrLf
        End If
        '
        s += "Average" + SpectrumFileSeparator + Form1.Cmb_Average.Text.Trim + If(Form1.chk_Average.Checked, "", " INACTIVE") + vbCrLf
        s += "Spatial avg." + SpectrumFileSeparator + Form1.txt_SpatialAveraging.Text.Trim + vbCrLf
        '
        s += "RisingSpeed" + SpectrumFileSeparator + Form1.txt_RisingSpeed.Text + vbCrLf
        s += "FallingSpeed" + SpectrumFileSeparator + Form1.txt_FallingSpeed.Text + vbCrLf
        '
        s += "NanometersMax" + SpectrumFileSeparator + NanometersMax.ToString("0.00", GCI) + vbCrLf
        s += "NanometersMin" + SpectrumFileSeparator + NanometersMin.ToString("0.00", GCI) + vbCrLf
        '
        s += "Peak Area" + SpectrumFileSeparator + PeakArea.ToString("0.0", GCI) + vbCrLf
        '
        s += "-----------------------" + vbCrLf
        s += "Nanometers" + SpectrumFileSeparator + "Intensity" + vbCrLf
        s += "-----------------------" + vbCrLf
        '
        s += CreateDataStringFromArray(Array_SpatialFiltered)
        '
        Return s
    End Function

    Private Function CreateDataStringFromArray(ByVal ar() As Single) As String
        Dim s As String = ""
        Dim k As Double = (NanometersMax - NanometersMin) / (Array_SpatialFiltered.Length - 1)
        If SpectrumFileSeparator = vbTab Then
            For i As Int32 = 0 To ar.Length - 1
                s += (NanometersMin + i * k).ToString("0.00", GCI) + vbTab + _
                     ar(i).ToString("0.0", GCI) + vbCrLf
            Next
        Else
            For i As Int32 = 0 To ar.Length - 1
                s += (NanometersMin + i * k).ToString("0.00", GCI) + SpectrumFileSeparator + _
                     ar(i).ToString("0.0", GCI).PadLeft(12) + vbCrLf
            Next
        End If
        Return s
    End Function

    Private Sub CreateInfoRunString()
        Info_RunString = "Sensor " + SENSOR_Type.ToString + " "
        If COM_IsOpen() Or WebCamIsWorking Then
            Info_RunString += "running" + vbCrLf
            Info_FileString = ""
        Else
            Info_RunString += "not connected" + vbCrLf
        End If
        Info_RunString += "-------------------------------" + vbCrLf
        If SENSOR_Type = SensorTypes.WebCam Then
            Info_RunString += "Rec.Samples".PadRight(15) + Form1.Label_WebCamResolution.Text + vbCrLf
            Info_RunString += "FramesPerSec".PadRight(15) + Form1.Label_WebCamFPS.Text + vbCrLf
            '
            Info_RunString += "Exposure".PadRight(15) + DecodeExposureTimes(Form_VideoInControls.Label_Exposure.Text) + vbCrLf
            Info_RunString += "Gain".PadRight(15) + Form_VideoInControls.Label_Gain.Text + vbCrLf
            Info_RunString += "Brightness".PadRight(15) + Form_VideoInControls.Label_Brightness.Text + vbCrLf
            Info_RunString += "Contrast".PadRight(15) + Form_VideoInControls.Label_Contrast.Text + vbCrLf
            Info_RunString += "Gamma".PadRight(15) + Form_VideoInControls.Label_Gamma.Text + vbCrLf
            '
        Else
            Info_RunString += "Rec.Samples".PadRight(15) + Form1.Label_Resolution.Text + vbCrLf
            Info_RunString += "FramesPerSec".PadRight(15) + Form1.Label_FramesPerSec.Text + vbCrLf
            '
            Info_RunString += "Exposure".PadRight(15) + Form1.Cmb_ExposureTime.Text + vbCrLf
            '
            'Info_RunString += "Samples".PadRight(15) + Form1.Cmb_Resolution.Text.Trim + vbCrLf
            'Info_RunString += "AdcSpeed".PadRight(15) + Form1.Cmb_AdcSpeed.Text + vbCrLf
            '
            'Info_RunString += "Mode".PadRight(15) + Form1.Cmb_DebugType.Text + vbCrLf
            'Info_RunString += "AdcScale".PadRight(15) + Form1.Cmb_Scale.Text + vbCrLf
            '
            'Info_RunString += "AdcMax".PadRight(15) + Form1.Label_AdcMax.Text + vbCrLf
            'Info_RunString += "AdcMin".PadRight(15) + Form1.Label_AdcMin.Text + vbCrLf
            '
            'Info_RunString += "Rec.Max".PadRight(15) + ReceivedValueMax.ToString + vbCrLf
            'Info_RunString += "Rec.Min".PadRight(15) + ReceivedValueMin.ToString + vbCrLf
        End If
        '
        Info_RunString += "Average".PadRight(15) + Form1.Cmb_Average.Text.Trim + If(Form1.chk_Average.Checked, "", " INACTIVE") + vbCrLf
        Info_RunString += "Spatial avg.".PadRight(15) + Form1.txt_SpatialAveraging.Text.Trim + vbCrLf
        '
        Info_RunString += "RisingSpeed".PadRight(15) + Form1.txt_RisingSpeed.Text + vbCrLf
        Info_RunString += "FallingSpeed".PadRight(15) + Form1.txt_FallingSpeed.Text + vbCrLf
        '
        Info_RunString += "NanometersMax".PadRight(15) + NanometersMax.ToString("0.00", GCI) + vbCrLf
        Info_RunString += "NanometersMin".PadRight(15) + NanometersMin.ToString("0.00", GCI) + vbCrLf
        '
        Info_RunString += "Peak Area".PadRight(15) + PeakArea.ToString("0.0", GCI) + vbCrLf
    End Sub

    Private Function DecodeExposureTimes(ByVal s As String) As String
        Dim max As Int32 = Form_VideoInControls.TrackBar_Exposure.Maximum
        Dim min As Int32 = Form_VideoInControls.TrackBar_Exposure.Minimum
        If max = 10 And min = -13 Then
            Dim t As String = ""
            Select Case s
                Case "-13" : t = " (122 uS)"
                Case "-12" : t = " (244 uS)"
                Case "-11" : t = " (488 uS)"
                Case "-10" : t = " (976 uS)"
                Case "-9" : t = " (1.95 mS)"
                Case "-8" : t = " (3.91 mS)"
                Case "-7" : t = " (7.81 mS)"
                Case "-6" : t = " (15.62 mS)"
                Case "-5" : t = " (31.25 mS)"
                Case "-4" : t = " (62.5 mS)"
                Case "-3" : t = " (125 mS)"
                Case "-2" : t = " (250 mS)"
                Case "-1" : t = " (500 mS)"
                Case "0" : t = " (1 Sec)"
                Case "1" : t = " (2 Sec)"
                Case "2" : t = " (4 Sec)"
                Case "3" : t = " (8 Sec)"
                Case "4" : t = " (16 Sec)"
                Case "5" : t = " (32 Sec)"
                Case "6" : t = " (64 Sec)"
                Case "7" : t = " (128 Sec)"
                Case "8" : t = " (256 Sec)"
                Case "9" : t = " (512 Sec)"
                Case "10" : t = " (1024 Sec)"
            End Select
            s = s.PadRight(3) + t
        End If
        Return s
    End Function

    ' ======================================================================================
    '  LOAD SPECTRUM FILE
    ' ======================================================================================
    Friend Sub Spectrometer_SetSpectrumTextFromFile(ByVal file As String)
        If Not IO.File.Exists(file) Then Return
        Dim sa() As String = IO.File.ReadAllLines(file)
        Dim nm As Single
        Dim l() As String
        Dim s As String
        Dim n As Int32 = 0
        Dim NmMin As Double = 0
        Dim NmMax As Double = 0
        Dim SensorName As String = ""
        Info_FileString = ""
        For i As Int32 = 0 To sa.Length - 1
            s = sa(i)
            s = ReplaceMultipleSpacesAndTrim(s)
            s = s.Replace(vbTab, ";")
            s = s.Replace(",", ";")
            l = s.Split(";"c)
            If l.Length = 2 Then
                nm = CSng(Val(l(0)))
                If nm > 0 Then
                    If n = 0 Then
                        NmMin = nm
                    End If
                    If nm > NmMax Then
                        NmMax = nm
                    End If
                    ReDim Preserve Array_Calibrated(n)
                    Array_Calibrated(n) = CSng(Val(l(1)))
                    n += 1
                Else
                    ' ----------------------------------------------------------------------------------------- To GroupBox_SensorSamples controls
                    Select Case l(0).ToLower
                        Case "sensor"
                            Info_FileString += "Sensor".PadRight(15) + l(1) + vbCrLf
                            SensorName = l(1)
                            '
                            'Case "mode" : Combo_SetIndex_FromString(Form1.Cmb_DebugType, l(1))
                            'Case "adcscale" : Combo_SetIndex_FromString(Form1.Cmb_Scale, l(1))
                            '
                        Case "receivedsamples" : Form1.Label_Resolution.Text = l(1)
                        Case "framespersec" : Form1.Label_FramesPerSec.Text = l(1)
                            '
                            'Case("adcmax") : Form1.txt_AdcMax.Text = l(1)
                            'Case("adcmin") : Form1.txt_AdcMin.Text = l(1)
                            '
                        Case "receivedvaluemax" : ReceivedValueMax = CSng(Val(l(1)))
                        Case "receivedvaluemin" : ReceivedValueMin = CSng(Val(l(1)))
                            '
                            'Case "risingspeed" : Form1.txt_RisingSpeed.Text = l(1)
                            'Case "fallingspeed" : Form1.txt_FallingSpeed.Text = l(1)
                            '
                            'Case "nanometersmax" : NanometersMax = Val(l(1)) ' Already done by NmMax
                            'Case "nanometersmin" : NanometersMin = Val(l(1))' Already done by NmMin
                    End Select
                    ' ----------------------------------------------------------------------------------------- To FORM_INFO
                    If SensorName.ToLower = "webcam" Then
                        Select Case l(0).ToLower
                            Case "rec.samples" : Info_FileString += "Rec.Samples".PadRight(15) + l(1) + vbCrLf
                            Case "framespersec" : Info_FileString += "FramesPerSec".PadRight(15) + l(1) + vbCrLf
                                '
                            Case "exposure" : Info_FileString += "Exposure".PadRight(15) + l(1) + vbCrLf
                            Case "gain" : Info_FileString += "Gain".PadRight(15) + l(1) + vbCrLf
                            Case "brightness" : Info_FileString += "Brightness".PadRight(15) + l(1) + vbCrLf
                            Case "contrast" : Info_FileString += "Contrast".PadRight(15) + l(1) + vbCrLf
                            Case "gamma" : Info_FileString += "Gamma".PadRight(15) + l(1) + vbCrLf
                                '
                            Case "average" : Info_FileString += "Average".PadRight(15) + l(1) + vbCrLf
                            Case "spatial avg." : Info_FileString += "Spatial avg.".PadRight(15) + l(1) + vbCrLf
                        End Select
                    Else
                        Select Case l(0).ToLower
                            Case "samples" : Info_FileString += "Samples".PadRight(15) + l(1) + vbCrLf
                            Case "adcspeed" : Info_FileString += "AdcSpeed".PadRight(15) + l(1) + vbCrLf
                            Case "exposure" : Info_FileString += "Exposure".PadRight(15) + l(1) + vbCrLf
                            Case "average" : Info_FileString += "Average".PadRight(15) + l(1) + vbCrLf
                            Case "spatial avg." : Info_FileString += "Spatial avg.".PadRight(15) + l(1) + vbCrLf
                                '
                                'Case "mode" : Info_String += "Mode".PadRight(15) + l(1) + vbCrLf
                                'Case "adcscale" : Info_String += "AdcScale".PadRight(15) + l(1) + vbCrLf
                                '
                            Case "receivedsamples" : Info_FileString += "Rec.Samples ".PadRight(15) + l(1) + vbCrLf
                            Case "framespersec" : Info_FileString += "FramesPerSec ".PadRight(15) + l(1) + vbCrLf
                        End Select
                    End If
                    '
                    Select Case l(0).ToLower
                        'Case("adcmax") : Info_String += "AdcMax".PadRight(15) + l(1) + vbCrLf
                        'Case("adcmin") : Info_String += "AdcMin".PadRight(15) + l(1) + vbCrLf
                        '
                        'Case "receivedvaluemax" : Info_String += "Rec.Max".PadRight(15) + l(1) + vbCrLf
                        'Case "receivedvaluemin" : Info_String += "Rec.Min".PadRight(15) + l(1) + vbCrLf
                        '
                        Case "risingspeed" : Info_FileString += "RisingSpeed".PadRight(15) + l(1) + vbCrLf
                        Case "fallingspeed" : Info_FileString += "FallingSpeed".PadRight(15) + l(1) + vbCrLf
                            '
                        Case "nanometersmax" : Info_FileString += "NanometersMax".PadRight(15) + l(1) + vbCrLf
                        Case "nanometersmin" : Info_FileString += "NanometersMin".PadRight(15) + l(1) + vbCrLf
                    End Select
                    '
                End If
            End If
        Next
        If NmMax > 0 Then
            '
            Form1.CloseWebCam()
            Form1.CloseComm()
            '
            Spectrometer_ResetReference()
            Spectrometer_ResetBackground()
            Form1.btn_Reference.Checked = False
            Form1.btn_Background.Checked = False
            '
            Info_FileName = IO.Path.GetFileName(file)
            '
            NanometersMin = NmMin
            NanometersMax = NmMax
            ' 
            ' ------------------------------------------------
            Calib_BIN = NormalizeArrayTo(New Double() {0, 1}, 1, Array_Calibrated.Length)
            Calib_NM = New Double() {NanometersMin, NanometersMax}
            ' ------------------------------------------------
            '
            ' ------------------------------------------------
            SENSOR_NumSamples = Array_Calibrated.Length
            SrcW = SENSOR_NumSamples
            ' ------------------------------------------------
            ReDim Array_SpatialFiltered(SENSOR_NumSamples - 1)
            ReDim Array_AverageFiltered(SENSOR_NumSamples - 1)
            ' ------------------------------------------------ DECALIBRATION UNUSED
            'Array_Calibrated_To_Array_UpDownFiltered()
            Array_UpDownFiltered = CType(Array_Calibrated.Clone, Single())
            ' ------------------------------------------------
            SpecArray_To_ReceivedSamples()
            ' ------------------------------------------------
            Spectrometer_SetSourceParams()
            Spectrometer_RedrawSamples()
            ' ------------------------------------------------
            Save_INI()
        End If
    End Sub

    Private Sub SpecArray_To_ReceivedSamples()
        If SENSOR_Type = SensorTypes.WebCam Then Return
        ReDim Array_ReceivedSamples(Array_UpDownFiltered.Length - 1)
        ReceivedValueMin = Single.MaxValue
        ReceivedValueMax = Single.MinValue
        Dim min As Int32 = Form1.txt_AdcMin.NumericValueInteger
        Dim v As Int32
        InitAdcScaleAndScaleCoeff()
        For i As Int32 = 0 To Array_UpDownFiltered.Length - 1
            v = CInt(Array_UpDownFiltered(i) / ScaleCoeff_to65536 + min)
            ' ---------------------------------------------------------------- Received samples Min and Max
            If v < ReceivedValueMin Then ReceivedValueMin = v
            If v > ReceivedValueMax Then ReceivedValueMax = v
            ' ----------------------------------------------------------------
            Array_ReceivedSamples(i) = v
        Next
    End Sub

    ' ======================================================================================
    '  SHOW INFO
    ' ======================================================================================
    Private Info_FileName As String = ""
    Private Info_FileString As String = ""
    Private Info_RunString As String = ""

    Friend Sub UpdateFormInfo()
        If Not Form_Info.Visible Then Return
        Dim s As String = ""
        If Info_FileString = "" Or COM_IsOpen() Or WebCamIsWorking Then
            CreateInfoRunString()
            s += Info_RunString + vbCrLf
            s += "Integration times to precision" + vbCrLf
            s += "-------------------------------" + vbCrLf
            s += RisingFallingTimes()
        Else
            s += "FILE: " + Info_FileName + vbCrLf
            s += "-------------------------------" + vbCrLf
            If Not Info_FileName.Contains("LastSpectrum") Then
                s += Info_FileString + vbCrLf
            End If
        End If
        If s <> Form_Info.Label_Info.Text Then
            Form_Info.Label_Info.Text = s
            Form_Info.Label_Info.SelectionStart = 0
            Form_Info.Label_Info.SelectionLength = 0
        End If
    End Sub

    Private Function RisingFallingTimes() As String
        Dim r10 As String
        Dim r5 As String
        Dim r1 As String
        Dim f10 As String
        Dim f5 As String
        Dim f1 As String
        Dim ExpMicrosec As UInt32 = Form1.GetExposureTimeMicrosec
        Dim AdcSpeed As Int32 = CInt(Form1.Cmb_AdcSpeed.Text)
        Dim WebCamFPS As Int32
        ' ------------------------------------------------------------------------------------- calc times
        Dim MillisecsPerFrame As Double
        If SENSOR_Type = SensorTypes.WebCam Then
            WebCamFPS = CInt(Val(Form1.Label_WebCamFPS.Text))
            If WebCamFPS < 1 Then WebCamFPS = 1
            MillisecsPerFrame = 1000 / WebCamFPS
        Else
            MillisecsPerFrame = CalcMillisecsPerFrame(SENSOR_NumSamples, AdcSpeed, ExpMicrosec)
        End If
        r10 = CalcRisingFallingSeconds(KSpeedUP, MillisecsPerFrame, 0.1)
        r5 = CalcRisingFallingSeconds(KSpeedUP, MillisecsPerFrame, 0.05)
        r1 = CalcRisingFallingSeconds(KSpeedUP, MillisecsPerFrame, 0.01)
        f10 = CalcRisingFallingSeconds(KSpeedDW, MillisecsPerFrame, 0.1)
        f5 = CalcRisingFallingSeconds(KSpeedDW, MillisecsPerFrame, 0.05)
        f1 = CalcRisingFallingSeconds(KSpeedDW, MillisecsPerFrame, 0.01)
        ' -------------------------------------------------------------------------------------
        Dim s As String = ""
        If r1 = "0" Then
            s += "Rising times =  0 seconds" + vbCrLf
        Else
            s += "Rising time to 10% =  " + r10 + vbCrLf
            s += "Rising time to  5% =  " + r5 + vbCrLf
            s += "Rising time to  1% =  " + r1 + vbCrLf + vbCrLf
        End If
        If KSpeedDW = 0 Then
            s += "Falling time = INFINITY" + vbCrLf
        Else
            If f1 = "0" Then
                s += "Falling times = 0 seconds" + vbCrLf
            Else
                s += "Falling time to 10% = " + f10 + vbCrLf
                s += "Falling time to  5% = " + f5 + vbCrLf
                s += "Falling time to  1% = " + f1 + vbCrLf
            End If
        End If
        ' -------------------------------------------------------------------------------------
        Return s
    End Function


    Private Function CalcMillisecsPerFrame(ByVal Nsamples As Int32, _
                                           ByVal AdcSpeed As Int32, _
                                           ByVal ExposureUsec As UInt32) As Double
        '
        Dim MillisecPerSample As Double = 0.026
        If AdcSpeed = 2 Then MillisecPerSample *= 2
        If AdcSpeed = 1 Then MillisecPerSample *= 4
        '
        Return Nsamples * MillisecPerSample + ExposureUsec / 1000 + 2
    End Function


    Private Function CalcRisingFallingSeconds(ByVal UpDownSpeed As Single, _
                                              ByVal MillisecsPerFrame As Double, _
                                              ByVal Precision As Single) As String

        If UpDownSpeed = 1 Then Return "0"
        If UpDownSpeed = 0 Then Return "INFINITY"
        '
        Dim NIterations As UInt32
        NIterations = CUInt(Math.Ceiling(Math.Log(Precision) / Math.Log(1 - UpDownSpeed)))
        '
        Dim t As UInt32 = CUInt(MillisecsPerFrame * NIterations / 1000)
        If t < 60 Then
            Return t.ToString + " sec."
        Else
            Return SecondsToHrsMinSec(t)
        End If
    End Function

End Module
