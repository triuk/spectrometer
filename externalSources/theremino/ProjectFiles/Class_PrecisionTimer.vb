
Friend Class PrecisionTimer

    Private sw As Stopwatch = New Stopwatch

    Friend Sub New()
        sw.Start()
    End Sub

    ' ------------------------------------------- Explicit Start and Stop
    Friend Sub StartTimer()
        sw.Start()
    End Sub

    Friend Sub StopTimer()
        sw.Stop()
    End Sub

    ' ------------------------------------------- GetTime functions
    Friend Function GetTimeMillisec() As Double
        GetTimeMillisec = sw.ElapsedMilliseconds
        sw.Reset()
    End Function

    Friend Function GetTimeMicrosec() As Double
        GetTimeMicrosec = CInt(sw.Elapsed.TotalMilliseconds * 1000)
        sw.Reset()
    End Function

End Class

