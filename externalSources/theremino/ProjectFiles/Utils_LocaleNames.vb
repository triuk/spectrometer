Imports System.Windows.Forms

Module Utils_LocaleNames

    Friend Language As String = "ENG"
    Private ls(1, -1) As String

    Friend Sub SetLocales()
        ' ------------------------------------- read the file
        ReadLocaleFile()
        ' ------------------------------------- rename
        RenameControls(Form1)
        RenameControls(Form_VideoInControls)
        ' ------------------------------------- release the array
        ReDim ls(-1, -1)
    End Sub

    Private Sub ReadLocaleFile()
        Dim locfilename As String = PlatformAdjustedFileName(Application.StartupPath & "\Docs\Language_" & Language & ".txt")
        If Not FileExists(locfilename) Then
            locfilename = PlatformAdjustedFileName(Application.StartupPath & "\Docs\Language_ENG.txt")
        End If
        If FileExists(locfilename) Then
            Dim i As Int32 = -1
            Dim s0 As String
            Dim s1 As String
            '
            Dim f As IO.StreamReader
            f = New System.IO.StreamReader(locfilename, System.Text.Encoding.Default)
            '
            Do While Not f.EndOfStream
                s1 = f.ReadLine
                s1 = Trim(s1.Replace(vbTab, " "))
                s0 = ExtractParamName(s1)
                If s0.Length > 1 And s1.Length > 1 Then
                    If s0.StartsWith("Msg_") Then
                        AddMessage(s0, s1)
                    Else
                        i += 1
                        ' ---------------------------------------------
                        RedimPreserve_2D_Array(ls, 1, i)
                        ' --------------------------------------------- 
                        ls(0, i) = s0
                        ls(1, i) = s1
                    End If
                End If
            Loop
            f.Close()
        End If
    End Sub

    ' ===============================================================================================
    '  RENAME CONTROLS
    ' ===============================================================================================
    Private Sub RenameControls(ByVal container As Control)
        '
        For i As Int32 = 0 To ls.GetLength(1) - 1
            If container.Name = ls(0, i) Then
                container.Text = ls(1, i)
            End If
        Next
        '
        For Each ctrl As Control In container.Controls
            For i As Int32 = 0 To ls.GetLength(1) - 1

                If ctrl.Name = ls(0, i) Then
                    ctrl.Text = ls(1, i)
                End If

                If TypeOf ctrl Is ToolStrip Then
                    Dim ts As ToolStrip = DirectCast(ctrl, ToolStrip)
                    RenameToolStripItems(ts)
                End If

                If TypeOf ctrl Is MenuStrip Then
                    Dim ms As MenuStrip = DirectCast(ctrl, MenuStrip)
                    RenameMenuStripItems(ms)
                End If
            Next
            ' ---------------------------- Recursively call this function for any container controls.
            If container.HasChildren Then
                RenameControls(ctrl)
            End If
        Next
    End Sub

    Private Sub RenameToolStripItems(ByRef ts As ToolStrip)
        For i As Int32 = 0 To ls.GetLength(1) - 1
            For j As Int32 = 0 To ts.Items.Count - 1
                If ts.Items(j).Name = ls(0, i) Then
                    ts.Items(j).Text = " " & ls(1, i)
                End If
            Next
        Next
    End Sub

    Private Sub RenameMenuStripItems(ByRef ms As MenuStrip)
        For i As Int32 = 0 To ls.GetLength(1) - 1
            For j As Int32 = 0 To ms.Items.Count - 1
                If ms.Items(j).Name = ls(0, i) Then
                    ms.Items(j).Text = " " & ls(1, i)
                End If
                Dim tsmi As ToolStripMenuItem = DirectCast(ms.Items(j), ToolStripMenuItem)
                For k As Int32 = 0 To tsmi.DropDownItems.Count - 1
                    If tsmi.DropDownItems(k).Name = ls(0, i) Then
                        tsmi.DropDownItems(k).Text = " " & ls(1, i)
                    End If
                    ' ---------------------------------------------------------- second level menu
                    Dim tsmi2 As ToolStripMenuItem = TryCast(tsmi.DropDownItems(k), ToolStripMenuItem)
                    If tsmi2 IsNot Nothing Then
                        For l As Int32 = 0 To tsmi2.DropDownItems.Count - 1
                            If tsmi2.DropDownItems(l).Name = ls(0, i) Then
                                tsmi2.DropDownItems(l).Text = " " & ls(1, i)
                            End If
                        Next
                    End If
                Next
            Next
        Next
    End Sub


    ' ===============================================================================================
    '  MESSAGES
    ' ===============================================================================================
    Friend Msg_About As String = "Visible, UVA and Near Infrared Spectrometer"
    Friend Msg_About2 As String = "Since version 4 the input is extended to Linear Sensors"
    Friend Msg_WaitingSamples As String = "Waiting samples"
    Friend Msg_PleaseWait As String = "Please wait"
    Friend Msg_SaveDataFile As String = "Save data file"
    Friend Msg_SetSlotsTitle As String = "Set slots"
    Friend Msg_SlotCommands As String = "Enter the text slot for commands."
    Friend Msg_StotResponses As String = "Enter the text slot for responses."
    Friend Msg_NewTrimPoint As String = "Add new trimming point ?"
    Friend Msg_CanNotDelete As String = "Can not delete the last 2 trimming points"
    Friend Msg_Delete As String = "Delete this trimming point ?"
    Friend Msg_Connect As String = "Connect"
    Friend Msg_Disconnect As String = "Disconnect"
    Friend Msg_Exposure As String = "Exposure"
    Friend Msg_AutoExp As String = "Auto exp."
    Friend Msg_Mean As String = "Mean"

    Private Sub AddMessage(ByVal s0 As String, ByVal s1 As String)
        Select Case s0
            Case "Msg_About" : Msg_About = s1
            Case "Msg_About2" : Msg_About2 = s1
            Case "Msg_WaitingSamples" : Msg_WaitingSamples = s1
            Case "Msg_PleaseWait" : Msg_PleaseWait = s1
            Case "Msg_SaveDataFile" : Msg_SaveDataFile = s1
            Case "Msg_SetSlotsTitle" : Msg_SetSlotsTitle = s1
            Case "Msg_SlotCommands" : Msg_SlotCommands = s1
            Case "Msg_StotResponses" : Msg_StotResponses = s1
            Case "Msg_NewTrimPoint" : Msg_NewTrimPoint = s1
            Case "Msg_CanNotDelete" : Msg_CanNotDelete = s1
            Case "Msg_Delete" : Msg_Delete = s1
            Case "Msg_Connect" : Msg_Connect = s1
            Case "Msg_Disconnect" : Msg_Disconnect = s1
            Case "Msg_Exposure" : Msg_Exposure = s1
            Case "Msg_AutoExp" : Msg_AutoExp = s1
            Case "Msg_Mean" : Msg_Mean = s1
        End Select
    End Sub

End Module
