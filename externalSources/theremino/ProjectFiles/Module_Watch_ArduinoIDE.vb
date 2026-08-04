Imports System.Runtime.InteropServices
Imports System.Text

Module Module_Watch_ArduinoIDE

    <DllImport("user32.dll", SetLastError:=True)> _
    Private Function GetForegroundWindow() As IntPtr
    End Function

    <DllImport("user32.dll", SetLastError:=True, CharSet:=CharSet.Auto)> _
    Private Function GetWindowTextLength(ByVal hWnd As IntPtr) As Integer
    End Function

    <DllImport("user32.dll", CharSet:=CharSet.Auto, SetLastError:=True)> _
    Private Function GetWindowText(ByVal hWnd As IntPtr, ByVal lpString As StringBuilder, ByVal nMaxCount As Integer) As Integer
    End Function

    Private Function GetActiveWindowTitle() As String
        Dim handle As IntPtr = GetForegroundWindow()
        Dim length As Integer = GetWindowTextLength(handle)
        Dim title As New StringBuilder("", length + 1)
        GetWindowText(handle, title, title.Capacity)
        Return title.ToString()
    End Function

    ' ----------------------------------------------------- about 50 uS 
    Friend Function ArduinoIDE_HasFocus() As Boolean
        Dim s As String = GetActiveWindowTitle()
        Return s.Contains(" | Arduino IDE")
    End Function

    ' =============================================================================
    '  CALLED FROM Form1.Timer 100mS
    ' =============================================================================
    Friend Sub TestArduinoIde()
        Static TryToReconnect As Boolean = False
        If ArduinoIDE_HasFocus() Then
            If COM_IsOpen() Then
                ' -------------------------------------------------------- DISCONNECT IF ARDUINO IDE FOCUSED
                COM_Close()
                Form1.UpdateComButton()
                PlaySound_ComClose()
                TryToReconnect = True
            End If
        Else
            ' ------------------------------------------------------------ RECONNECT 
            If TryToReconnect Then
                If Form1.ActiveForm IsNot Nothing Then
                    If Not COM_IsOpen() Then
                        Form1.OpenComm()
                        Threading.Thread.Sleep(100)
                        If COM_IsOpen() Then
                            TryToReconnect = False
                            PlaySound_ComOpen()
                        End If
                    End If
                End If
            End If
        End If
    End Sub

    ' =============================================================
    '   PLAY SOUNDS
    ' =============================================================
    Friend Sub PlaySound_ComClose()
        My.Computer.Audio.Play(Resources.ComClose, AudioPlayMode.Background)
    End Sub
    Friend Sub PlaySound_ComOpen()
        My.Computer.Audio.Play(Resources.ComOpen, AudioPlayMode.Background)
    End Sub
    Friend Sub PlaySound_Success()
        My.Computer.Audio.Play(Resources.Success2, AudioPlayMode.Background)
    End Sub
    Friend Sub PlaySound_Success_Wait()
        My.Computer.Audio.Play(Resources.Success2, AudioPlayMode.WaitToComplete)
    End Sub
    Friend Sub PlaySound_Success2()
        My.Computer.Audio.Play(Resources.bepbeep, AudioPlayMode.Background)
    End Sub
    Friend Sub PlaySound_Success2_Wait()
        My.Computer.Audio.Play(Resources.bepbeep, AudioPlayMode.WaitToComplete)
    End Sub
    Friend Sub PlaySound_Click2a()
        My.Computer.Audio.Play(Resources.Click2a, AudioPlayMode.Background)
    End Sub
    Friend Sub PlaySound_Click2b()
        My.Computer.Audio.Play(Resources.Click2b, AudioPlayMode.Background)
    End Sub
    Friend Sub PlaySound_Click2c()
        My.Computer.Audio.Play(Resources.Click2c, AudioPlayMode.Background)
    End Sub

    Friend Sub PlaySound_HonkHonk()
        My.Computer.Audio.Play(Resources.HonkHonk, AudioPlayMode.Background)
    End Sub
    Friend Sub PlaySound_Laser()
        My.Computer.Audio.Play(Resources.Laser, AudioPlayMode.Background)
    End Sub

End Module
