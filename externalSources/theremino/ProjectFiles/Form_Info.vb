Public Class Form_Info

    Private Sub Me_Load(ByVal sender As Object, ByVal e As System.EventArgs) Handles Me.Load
        Me.Text = AppTitleAndVersion() '+ " - Info"
        InitSnap()
        LimitFormPosition(Me)
        Form1.Tools_Info.Checked = True
    End Sub

    Private Sub Form_Info_FormClosing(ByVal sender As Object, ByVal e As System.Windows.Forms.FormClosingEventArgs) Handles Me.FormClosing
        If e.CloseReason <> CloseReason.WindowsShutDown And _
           e.CloseReason <> CloseReason.FormOwnerClosing Then
            Me.Hide()
            e.Cancel = True
            EventsAreEnabled = False
            Form1.Tools_Info.Checked = False
            EventsAreEnabled = True
        End If
    End Sub

    Private Sub Form_Info_LocationChanged(ByVal sender As Object, ByVal e As System.EventArgs) Handles Me.LocationChanged
        If Not EventsAreEnabled Then Exit Sub
        FormInfo_Left = Me.Location.X
        FormInfo_Top = Me.Location.Y
        FormInfo_Width = Me.Size.Width
        FormInfo_Height = Me.Size.Height
        LimitFormPosition(Me)
        Save_INI()
    End Sub



    ' =======================================================================================
    '   SNAP WINDOW
    ' =======================================================================================
    Private SnapPosition As Int32 = 0
    ' --------------------------------------------------------------------- InitSmap must be calle from FormLoad
    Private Sub InitSnap()
        ' ---------------------------------- prepare snap params (timer will be disabled automatically)
        SnapMouseMoveTimer.Enabled = True
        TestSnap()
    End Sub
    ' --------------------------------------------------------------------- Start snap when clicking on TitleBar
    <DebuggerStepThrough()> _
    Protected Overrides Sub WndProc(ByRef m As Message)
        Const WM_NCLBUTTONDOWN As Integer = 161
        Const HTCAPTION As Integer = 2
        If m.Msg = WM_NCLBUTTONDOWN AndAlso m.WParam.ToInt32 = HTCAPTION Then
            Me.Select()
            Snap_MouseDown()
            Return
        End If
        MyBase.WndProc(m)
    End Sub
    ' --------------------------------------------------------------------- test snap positions
    Private Sub TestSnap()
        Dim newSnap As Int32 = 0
        If Math.Abs(Me.Left - Form1.Right) < 40 And Math.Abs(Me.Top - Form1.Top) < 40 Then newSnap = 1
        If Math.Abs(Me.Left + Me.Width - Form1.Left) < 40 And Math.Abs(Me.Top - Form1.Top) < 40 Then newSnap = 2
        If newSnap <> SnapPosition Then
            SnapPosition = newSnap
            If newSnap <> 0 Then
                SnapMouseMoveTimer.Enabled = False
                SetSnap()
            End If
        End If
    End Sub
    ' --------------------------------------------------------------------- set position to snap positions
    '    must be called from MainForm:DockAllWindows and from ResizeEnd
    ' -----------------------------------------------------------------------------------------------------
    Friend Sub SetSnap()
        If Form1.Left < -30000 Then Return
        ' ------------------------------------------------------- large border if Major>5 (not XP)
        Dim bx As Int32 = 0
        Dim by As Int32 = 0
        If Environment.OSVersion.Version.Major > 5 AndAlso Environment.OSVersion.Version.Minor < 2 Then
            If Form1.FormBorderStyle = Windows.Forms.FormBorderStyle.Sizable Then
                bx = 5
                by = 5
            Else
                bx = 10
                by = 0
            End If
        End If
        ' -------------------------------------------------------
        Select Case SnapPosition
            Case 1 : Me.Left = Form1.Right + bx : Me.Top = Form1.Top + by
            Case 2 : Me.Left = Form1.Left - Me.Size.Width - bx : Me.Top = Form1.Top + by
        End Select
    End Sub
    ' --------------------------------------------------------------------- move the window with the mouse
    Private CursorStartPos As Point
    Private FormStartPos As Point
    Private WithEvents SnapMouseMoveTimer As Timer = New Timer

    Private Sub Snap_Form_Move(ByVal sender As Object, ByVal e As System.EventArgs) Handles Me.Move
        If Not SnapMouseMoveTimer.Enabled Then Return
        LimitFormPosition(Me)
        TestSnap()
    End Sub
    Private Sub Snap_MouseDown()
        CursorStartPos = Cursor.Position
        FormStartPos = Me.Location
        SnapMouseMoveTimer.Interval = 15
        SnapMouseMoveTimer.Enabled = True
    End Sub
    Private Sub SnapMouseMoveTimer_Tick(ByVal sender As Object, ByVal e As System.EventArgs) Handles SnapMouseMoveTimer.Tick
        If MouseButtonLeftPressed() Then
            Me.Location = New Point(FormStartPos.X + Cursor.Position.X - CursorStartPos.X, _
                                    FormStartPos.Y + Cursor.Position.Y - CursorStartPos.Y)
        Else
            SnapMouseMoveTimer.Enabled = False
        End If
    End Sub

    Private Sub Form_VideoInControls_LocationChanged(ByVal sender As Object, ByVal e As System.EventArgs) Handles Me.LocationChanged
        LimitFormPosition_CompletelyVisible(Me)
    End Sub

End Class