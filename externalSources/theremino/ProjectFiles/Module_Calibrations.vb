Module Module_Calibrations

    Friend Calib_BIN() As Double = {1000, 2000}
    Friend Calib_NM() As Double = {436, 546}

    Friend Function Calib_BinToNm(ByVal bin As Double) As Double
        Return Interpolate(Calib_BIN, Calib_NM, bin)
    End Function

    Friend Function Calib_NmToBin(ByVal nm As Double) As Double
        Return Interpolate(Calib_NM, Calib_BIN, nm)
    End Function

    ' =======================================================================================================
    '  Linear Interpolation (and extrapolation) - The first array must be in increasing order 
    ' =======================================================================================================
    Friend Function Interpolate(ByVal x() As Double, ByVal y() As Double, ByVal xvalue As Double) As Double
        Dim i As Int32
        i = 1
        While x(i) < xvalue
            If i = x.Length - 1 Then Exit While
            i = i + 1
        End While
        Return (y(i - 1) + ((xvalue - x(i - 1)) / (x(i) - x(i - 1))) * (y(i) - y(i - 1)))
    End Function

    ' =====================================================
    '  TEST IF THE ARRAY IS IN CRESCENT ORDER
    ' =====================================================
    'Friend Function TestRisingValues(ByVal ar() As Double) As Boolean
    '    For i As Int32 = 0 To ar.Length - 2
    '        If ar(i) > ar(i + 1) Then Return False
    '    Next
    '    Return True
    'End Function


    ' =======================================================================================================
    '  EDIT ARRAY VALUES - PROTECTED TO PRESERVE THE CRESCENT ORDER
    ' =======================================================================================================
    Friend Sub EditCalibNM(ByVal i As Int32, ByVal v As Double)
        Dim max As Double = 2000
        If i < Calib_NM.Length - 1 Then max = Calib_NM(i + 1) - 0.25
        If v > max Then v = max
        Dim min As Double = 0
        If i > 0 Then min = Calib_NM(i - 1) + 0.25
        If v < min Then v = min
        Calib_NM(i) = v
    End Sub

    Friend Sub EditCalibBIN(ByVal i As Int32, ByVal v As Double)
        Dim max As Double = SENSOR_NumSamples
        If i < Calib_BIN.Length - 1 Then max = Calib_BIN(i + 1) - 1
        If v > max Then v = max
        Dim min As Double = 0
        If i > 0 Then min = Calib_BIN(i - 1) + 1
        If v < min Then v = min
        Calib_BIN(i) = v
    End Sub


    ' =====================================================
    '  TRIMMING POINTS - ADD and REMOVE 
    ' =====================================================
    Friend Sub AddTrimmingPoint(ByVal bin As Double, ByVal nm As Double)
        '
        If Calib_BIN.Length < 2 Then Exit Sub
        Dim insertIndex As Integer = Calib_BIN.Length
        '
        For i As Int32 = 0 To Calib_BIN.Length - 1
            If bin <= Calib_BIN(i) Then
                insertIndex = i
                Exit For
            End If
        Next
        '
        ReDim Preserve Calib_BIN(Calib_BIN.Length)
        ReDim Preserve Calib_NM(Calib_NM.Length)
        '
        For i As Int32 = Calib_BIN.Length - 1 To insertIndex + 1 Step -1
            Calib_BIN(i) = Calib_BIN(i - 1)
            Calib_NM(i) = Calib_NM(i - 1)
        Next
        '
        Calib_BIN(insertIndex) = bin
        Calib_NM(insertIndex) = nm
    End Sub

    Friend Sub RemoveTrimmingPoint(ByVal i As Int32)
        If Calib_BIN.Length < 3 Then Return
        For j As Int32 = i To Calib_BIN.Length - 2
            Calib_BIN(j) = Calib_BIN(j + 1)
            Calib_NM(j) = Calib_NM(j + 1)
        Next
        ReDim Preserve Calib_BIN(Calib_BIN.Length - 2)
        ReDim Preserve Calib_NM(Calib_NM.Length - 2)
    End Sub

    ' =====================================================
    '  ARRAY TO/FROM STRING
    ' =====================================================
    Friend Function ArrayToString(ByVal array() As Double) As String
        Dim s As String = ""
        For i As Int32 = 0 To array.Length - 1
            s += array(i).ToString(GCI) + "|"
        Next
        Return s.TrimEnd("|"c)
    End Function
    Friend Function ArrayFromString(ByVal str As String) As Double()
        Dim ar(-1) As Double
        Dim sa() As String = str.Split("|"c)
        If sa.Length < 2 Then Return ar
        ReDim ar(sa.Length - 1)
        For i As Int32 = 0 To sa.Length - 1
            ar(i) = Val(sa(i))
        Next
        Return ar
    End Function

    ' =====================================================
    '  CALIBRATION NENOMETERS
    ' =====================================================
    Friend Function CalibrationNanometersToString() As String
        Return ArrayToString(Calib_NM)
    End Function

    Friend Sub CalibrationNanometersFromString(ByVal s As String)
        Dim ar() As Double = ArrayFromString(s)
        If ar.Length < 2 Then Return
        Calib_NM = ar
    End Sub

    ' =====================================================
    '  CALIBRATION BINS NORMALIZED
    ' =====================================================
    Friend Function CalibrationBinsToString_Normalized() As String
        Dim Calib_BIN_Normalized() As Double
        Calib_BIN_Normalized = NormalizeArrayTo(Calib_BIN, SENSOR_NumSamples, 1)
        Return ArrayToString(Calib_BIN_Normalized)
    End Function
    Friend Sub CalibrationBinsFromString_Normalized(ByVal s As String)
        Dim ar() As Double = ArrayFromString(s)
        If ar.Length < 2 Then Return
        Calib_BIN = NormalizeArrayTo(ar, 1, SENSOR_NumSamples)
    End Sub

    ' =====================================================
    '  NORMALIZE ARRAY TO
    ' =====================================================
    Friend Function NormalizeArrayTo(ByVal array() As Double, ByVal FromMax As Double, ByVal ToMax As Double) As Double()
        Dim a(array.Length - 1) As Double
        Dim k As Double = ToMax / FromMax
        For i As Int32 = 0 To array.Length - 1
            a(i) = array(i) * k
        Next
        Return a
    End Function

End Module
