
Imports System.IO.Ports
Imports System.Text

Module Module_COM

    Private WithEvents ComPort As New SerialPort()

    Friend Sub COM_Open(ByVal PortName As String, ByVal BaudRate As Int32)
        If PortName = "" Then PortName = "COM1"
        If BaudRate < 600 Then BaudRate = 600
        ' -------------------------------------------- If the port is Open then close it
        COM_Close()
        ComPort.PortName = PortName
        ComPort.BaudRate = BaudRate
        ComPort.Parity = Parity.None
        ComPort.DataBits = 8
        ComPort.StopBits = StopBits.One
        ' -------------------------------------------- Set receive threshold
        ComPort.ReceivedBytesThreshold = 200
        ' -------------------------------------------- Set buffer sizes (predefined 4096) 
        'ComPort.ReadBufferSize = 10000  ' Settings less then 4096 are ignored
        'ComPort.WriteBufferSize = 10000 ' Settings less then 4096 are ignored
        ' -------------------------------------------- Timeout
        ComPort.WriteTimeout = 500
        ' -------------------------------------------- Disable DTR
        ComPort.DtrEnable = False
        ComPort.RtsEnable = False
        ComPort.Handshake = Handshake.None
        ' -------------------------------------------- ISO-8859-1 for String-Read and String-Write 
        ' -------------------------------------------- All chars from 0 to 255 and single byte for each char 
        ComPort.Encoding = System.Text.Encoding.GetEncoding("iso-8859-1")
        ' -------------------------------------------- Open the port
        Try
            ComPort.Open()
            'ComPort.DiscardInBuffer()
            'ComPort.DiscardOutBuffer()
        Catch
        End Try
    End Sub

    Friend Sub COM_Close()
        If ComPort.IsOpen Then
            ComPort.Close()
        End If
    End Sub

    Friend Function COM_GetPortNames() As String()
        If SerialPort.GetPortNames().Length = 0 Then Return New String() {"No ports"}
        Return SerialPort.GetPortNames()
    End Function

    Friend Function COM_IsOpen() As Boolean
        Return ComPort.IsOpen
    End Function

    Friend Sub COM_DiscardInBuffer()
        If ComPort.IsOpen Then
            ComPort.DiscardInBuffer()
        End If
    End Sub

    Friend Sub COM_DiscardOutBuffer()
        If ComPort.IsOpen Then
            ComPort.DiscardOutBuffer()
        End If
    End Sub

    ' ==============================================================================
    '   SEND
    ' ==============================================================================
    Friend Sub COM_SendString(ByVal text As String)
        If Not ComPort.IsOpen Then Return
        Try
            ComPort.Write(text + vbLf)
        Catch
        End Try
    End Sub

    ' ==============================================================================
    '   SEND OPTIONS TO HARDWARE
    ' ==============================================================================
    Friend Sub COM_SendOptionsToHardware(Optional ByVal repetitions As Int32 = 1)
        ' --------------------------------------------------------------------- Normalize array and SetSourceParams
        Calib_BIN = NormalizeArrayTo(Calib_BIN, _
                                     SENSOR_NumSamples, _
                                     CInt(Val(Form1.Cmb_Resolution.Text)))
        SENSOR_NumSamples = CInt(Val(Form1.Cmb_Resolution.Text.Trim))
        Spectrometer_SetSourceParams()
        ' --------------------------------------------------------------------- send to hardware
        For i As Int32 = 1 To repetitions
            Dim s2 As String = "OPTIONS " + _
                               Form1.Cmb_Resolution.Text.Trim + " " + _
                               Form1.Cmb_AdcSpeed.Text.Trim + " " + _
                               Form1.Cmb_ExposureTime.Text.Trim.ToLower.Replace(" ", "") + " " + _
                               Form1.Cmb_DebugType.SelectedIndex.ToString + " " + _
                               If(SENSOR_Type = SensorTypes.TCD1254, "1", "0")
            COM_SendString(s2)
            '
            Threading.Thread.Sleep(50)
            '
            'Debug.Print(s2 + "          Length = " + s2.Length.ToString)
        Next
    End Sub

    ' ==============================================================================
    '   DEBUG PRINT
    ' ==============================================================================
    'Private Sub DebugPrintBufferBytes(ByVal start As Int32)
    '    If start < 0 Then start += COM_BufferSize
    '    If start >= COM_BufferSize Then start -= COM_BufferSize
    '    Dim s As String = ""
    '    For i As Int32 = 0 To 15
    '        s += COM_ReceivedSamples(start).ToString("000").PadRight(4)
    '        start += 1
    '        If start >= COM_BufferSize Then start = 0
    '    Next
    '    Debug.Print(s)
    'End Sub

    Private Sub DebugPrintExploreSyncBuffer(ByVal s As String)
        ' -------------------------------------------------------- COMMENT THIS TO REMOVE THE DEBUG PRINT SYNC
        'Debug.Print(s)
    End Sub


    ' ==============================================================================
    '   FIND SEQUENCE INDEX
    ' ==============================================================================
    Private StartSequence() As Byte = {255, 254, 253, 252, 251, 250, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9}

    Private Function FindSequenceIndex(ByVal Samples() As Byte, ByVal Sequence() As Byte, Optional ByVal StartIndex As Int32 = 0) As Int32
        Dim BufferSize As Integer = Samples.Length
        Dim SequenceLength As Integer = Sequence.Length
        ' --------------------------------------------------------- search all the buffer
        Dim CurrentIndex As Integer = StartIndex
        Dim i As Integer, j As Integer
        For i = 0 To BufferSize - 1
            j = 0
            Dim TestIndex As Int32 = CurrentIndex
            While Samples(TestIndex) = Sequence(j)
                TestIndex += 1
                j += 1
                ' ------------------------------------------------- return the found sequence start
                If j = SequenceLength Then
                    Return CurrentIndex
                End If
            End While
            ' ----------------------------------------------------- Increment index for next cycle
            CurrentIndex += 1
            If CurrentIndex >= BufferSize Then Return -1
        Next
        ' --------------------------------------------------------- Return -1 if not found
        Return -1
    End Function


    ' ==============================================================================
    '   RECEIVE POLLING NEW
    ' ==============================================================================
    Private BufferSize As Int32 = 100000
    Private WriteIndex As Int32 = 0
    Private ReceivedSamples(BufferSize) As Byte
    Private IndexStart, IndexStop As Int32
    Private RecordLength As Int32

    Private Sub ComPort_DataReceived(ByVal sender As Object, ByVal e As System.IO.Ports.SerialDataReceivedEventArgs) Handles ComPort.DataReceived
        ' 
        ' --------------------------------------------------------------------- Get NumBytes to read
        Dim NumBytes As Int32 = ComPort.BytesToRead
        'Debug.Print(NumBytes.ToString)
        ' --------------------------------------------------------------------- If not enough bytes then return to save CPU time
        If WriteIndex + NumBytes - IndexStart < RecordLength Then
            Return
        End If
        ' --------------------------------------------------------------------- Get record Length
        RecordLength = SENSOR_NumSamples * 2 + 16
        ' --------------------------------------------------------------------- Too many bytes for the buffer ?
        If WriteIndex + NumBytes >= BufferSize Then
            COM_DiscardInBuffer()
            ReDim ReceivedSamples(BufferSize)
            WriteIndex = 0
            PlaySound_HonkHonk()
            'PlaySound_Laser()
            Return
        End If
        ' --------------------------------------------------------------------- Too early to write the PollingBuffer ?
        'If PollingBufferIsReady Then
        '    PlaySound_Click2c()
        '    Return                  ' <-- This return can cause Spectrum-Delays
        'End If
        ' --------------------------------------------------------------------- Write the bytes and update the write index
        If Not COM_IsOpen() Then Return
        ComPort.Read(ReceivedSamples, WriteIndex, NumBytes)
        WriteIndex += NumBytes
        ' --------------------------------------------------------------------- Find the Start sequence
        If IndexStart < 0 Then IndexStart = 0
        IndexStart = FindSequenceIndex(ReceivedSamples, StartSequence, IndexStart)
        If IndexStart < 0 Then Return
        ' --------------------------------------------------------------------- Test if there are enough bytes
        If WriteIndex - IndexStart < RecordLength Then
            'Threading.Thread.Sleep(30)
            Return
        End If
        ' --------------------------------------------------------------------- Copy COM_ReceivedSamples to PollingBuffer 
        Array.Copy(ReceivedSamples, IndexStart + 16, _
                   PollingBuffer1, 0, _
                   WriteIndex - (IndexStart + 16) + 50)
        ' --------------------------------------------------------------------- Empty ReceivedSamples and copy the exceding bytes
        ReDim ReceivedSamples(BufferSize)
        ' --------------------------------------------------------------------- RECOVER the remaining spectrum section from PollingBuffer 
        Array.Copy(PollingBuffer1, (IndexStart + RecordLength) - (IndexStart + 16), _
                   ReceivedSamples, 0, _
                   WriteIndex - (IndexStart + RecordLength))

        WriteIndex = WriteIndex - (IndexStart + RecordLength)
        IndexStart = 0
        ' --------------------------------------------------------------------- Send buffer and restart
        PollingBufferIsReady = True
    End Sub

    ' ------------------------------------------------------------------------- POLLING from Spectrometer
    Private PollingBufferIsReady As Boolean
    Private PollingBuffer1(100000) As Byte

    Friend Sub COM_Polling()
        If PollingBufferIsReady Then
            PollingBufferIsReady = False
            ' ----------------------------------------------------------------- Debug
            'TestBuffer(PollingBuffer1)
            ' ----------------------------------------------------------------- Send buffer and restart
            LinearSensor_To_ReceivedSamples(PollingBuffer1)
        End If
    End Sub

    Private Sub TestBuffer(ByVal Buffer() As Byte)
        Dim i As Int32
        Dim v As Single
        ' --------------------------------------------------------------------- Read all the samples
        For i = 0 To SENSOR_NumSamples - 1
            ' ----------------------------------------------------------------- Read Low Byte
            v = Buffer(i * 2)
            ' ----------------------------------------------------------------- Read High Byte
            v += 256 * Buffer(i * 2 + 1)
            ' ----------------------------------------------------------------- test
            If v > 1024 Then
                Debug.Print(i.ToString + " " + _
                            v.ToString + " " + _
                            (Buffer(i * 2)).ToString + " " + _
                            (Buffer(i * 2 + 1)).ToString)
            End If
        Next
    End Sub

End Module



