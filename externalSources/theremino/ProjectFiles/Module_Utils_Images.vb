Imports System.Drawing.Imaging
Imports System.Drawing.Drawing2D

Module Module_Utils_Images

    ' =============================================================================================
    '  SET QUALITY
    ' =============================================================================================
    ' http://msdn.microsoft.com/en-us/library/k0fsyd4e.aspx

    Private Sub SetQuality(ByVal g As Graphics, ByVal nQuality As Int32)
        Select Case nQuality
            Case 1
                g.CompositingQuality = CompositingQuality.HighSpeed
                g.SmoothingMode = SmoothingMode.HighSpeed
                g.InterpolationMode = InterpolationMode.Low
            Case 2
                g.CompositingQuality = CompositingQuality.HighSpeed
                g.SmoothingMode = SmoothingMode.HighSpeed
                g.InterpolationMode = InterpolationMode.Bilinear
            Case 3
                g.CompositingQuality = CompositingQuality.HighSpeed
                g.SmoothingMode = SmoothingMode.HighSpeed
                g.InterpolationMode = InterpolationMode.HighQualityBilinear
            Case 4
                g.CompositingQuality = CompositingQuality.HighSpeed
                g.SmoothingMode = SmoothingMode.HighSpeed
                g.InterpolationMode = InterpolationMode.Bicubic
            Case 5
                g.CompositingQuality = CompositingQuality.HighQuality
                g.SmoothingMode = SmoothingMode.HighQuality
                g.InterpolationMode = InterpolationMode.Bicubic
            Case 6
                g.CompositingQuality = CompositingQuality.HighQuality
                g.SmoothingMode = SmoothingMode.HighQuality
                g.InterpolationMode = InterpolationMode.HighQualityBilinear
            Case 7
                g.CompositingQuality = CompositingQuality.HighQuality
                g.SmoothingMode = SmoothingMode.HighQuality
                g.InterpolationMode = InterpolationMode.HighQualityBicubic
            Case Else
                ' ------------------------------------------------------- ( quality 3 if < 1 or > 7 ) 
                g.CompositingQuality = CompositingQuality.HighSpeed
                g.SmoothingMode = SmoothingMode.HighSpeed
                g.InterpolationMode = InterpolationMode.HighQualityBilinear
        End Select
    End Sub


    ' =============================================================================================
    '  RESIZE
    ' =============================================================================================

    Public Sub ImageResize(ByRef imgOut As Image, _
                           ByRef imgIn As Image, _
                           ByVal w As Integer, ByVal h As Integer, _
                           ByVal quality As Int32)

        ' ---------------------------------------------------- init imgOut
        If imgOut Is Nothing Then imgOut = New Bitmap(w, h)
        If imgOut.Width <> w Or imgOut.Height <> h Then
            imgOut = New Bitmap(w, h)
        End If
        ' ---------------------------------------------------- resize
        Dim g As Graphics = Graphics.FromImage(imgOut)
        SetQuality(g, quality)
        g.DrawImage(imgIn, 0, 0, w, h)
    End Sub

    Public Sub ImageCropAndResize(ByRef imgOut As Image, _
                                  ByRef imgIn As Image, _
                                  ByVal OutW As Integer, ByVal OutH As Integer, _
                                  ByVal CropRectangle As Rectangle, _
                                  ByVal quality As Int32)

        ' ---------------------------------------------------- init imgOut
        If imgOut Is Nothing Then imgOut = New Bitmap(OutW, OutH)
        If imgOut.Width <> OutW Or imgOut.Height <> OutH Then
            imgOut = New Bitmap(OutW, OutH)
        End If
        ' ---------------------------------------------------- resize
        Dim g As Graphics = Graphics.FromImage(imgOut)
        SetQuality(g, quality)
        g.DrawImage(imgIn, New Rectangle(0, 0, OutW, OutH), CropRectangle, GraphicsUnit.Pixel)
    End Sub

    ' =============================================================================================
    '  RESIZE and ZOOM
    ' =============================================================================================
    Public Function ImageResize(ByRef img As Image, ByVal w As Integer, ByVal h As Integer, ByVal quality As Int32) As Image
        Dim bmp As New Bitmap(w, h)
        Dim g As Graphics = Graphics.FromImage(bmp)
        SetQuality(g, quality)
        g.DrawImage(img, 0, 0, w + 1, h + 1)
        Return bmp
    End Function

    Public Sub ImageResizeInPlace(ByRef img As Image, ByVal w As Integer, ByVal h As Integer, ByVal quality As Int32)
        If img Is Nothing Then Exit Sub
        Dim bmp As New Bitmap(w, h)
        Dim g As Graphics = Graphics.FromImage(bmp)
        SetQuality(g, quality)
        g.DrawImage(img, 0, 0, w + 1, h + 1)
        img = bmp
    End Sub

    Public Function ImageZoom(ByRef img As Image, ByVal zoom As Double, _
                                                    ByVal shiftX As Integer, _
                                                    ByVal shiftY As Integer, _
                                                    ByVal destW As Integer, _
                                                    ByVal destH As Integer, _
                                                    ByVal quality As Int32) As Image
        If img Is Nothing Then Return img
        '
        Dim bmp As New Bitmap(destW, destH)
        Dim g As Graphics = Graphics.FromImage(bmp)
        SetQuality(g, quality)

        Dim dest As Rectangle
        dest.X = 0
        dest.Y = 0
        dest.Width = destW
        dest.Height = destH

        Dim sx As Int32
        Dim sy As Int32
        Dim sw As Int32
        Dim sh As Int32

        sw = CInt(img.Width / zoom)
        sh = CInt(img.Height / zoom)
        sx = CInt((img.Width - sw) / 2 - shiftX)
        sy = CInt((img.Height - sh) / 2 - shiftY)


        g.DrawImage(img, dest, sx, sy, sw, sh, GraphicsUnit.Pixel)
        Return bmp
    End Function

    Public Function ImageZoom_AllParams(ByRef img As Image, _
                                         ByVal sx As Int32, _
                                         ByVal sy As Int32, _
                                         ByVal sw As Int32, _
                                         ByVal sh As Int32, _
                                         ByVal dx As Int32, _
                                         ByVal dy As Int32, _
                                         ByVal dw As Integer, _
                                         ByVal dh As Integer, _
                                         ByVal quality As Int32) As Image
        '
        If img Is Nothing Then Return img
        '
        Dim bmp As New Bitmap(dw, dh)
        Dim g As Graphics = Graphics.FromImage(bmp)
        SetQuality(g, quality)

        Dim dest As Rectangle
        dest.X = dx
        dest.Y = dy
        dest.Width = dw
        dest.Height = dh

        g.DrawImage(img, dest, sx, sy, sw, sh, GraphicsUnit.Pixel)
        Return bmp
    End Function

    ' =============================================================================================
    '  IMAGE CONTRAST
    ' =============================================================================================
    Friend Sub ImageContrast(ByRef img As Image, Optional ByVal cnt As Single = 2)
        Dim imgAttr As ImageAttributes = New ImageAttributes()
        imgAttr.SetColorMatrix(New ColorMatrix(New Single()() _
                               {New Single() {cnt, 0, 0, 0, 0}, _
                                New Single() {0, cnt, 0, 0, 0}, _
                                New Single() {0, 0, cnt, 0, 0}, _
                                New Single() {0, 0, 0, 1, 0}, _
                                New Single() {0, 0, 0, 0, 1}}))
        Dim g As Graphics = Graphics.FromImage(img)
        Dim w As Integer = img.Width
        Dim h As Integer = img.Height
        Dim rec As Rectangle = New Rectangle(0, 0, w, h)
        g.DrawImage(img, rec, 0, 0, w, h, GraphicsUnit.Pixel, imgAttr)
    End Sub

    ' =============================================================================================
    '  NEGATIVE AND GRAY
    ' =============================================================================================

    'Friend Sub ImageNegative(ByRef imgOut As Image, ByRef imgIn As Image, ByVal Quality As Int32)
    '    Dim w As Integer = imgIn.Width
    '    Dim h As Integer = imgIn.Height
    '    ' ---------------------------------------------------- the color matrix
    '    Dim cMatrix As ColorMatrix = New ColorMatrix(New Single()() _
    '                       {New Single() {-1, 0, 0, 0, 0}, _
    '                        New Single() {0, -1, 0, 0, 0}, _
    '                        New Single() {0, 0, -1, 0, 0}, _
    '                        New Single() {0, 0, 0, 1, 0}, _
    '                        New Single() {0, 0, 0, 0, 1}})
    '    ' ---------------------------------------------------- ImageAttributes object
    '    Dim imgAttr As New ImageAttributes()
    '    imgAttr.SetColorMatrix(cMatrix)
    '    ' ---------------------------------------------------- init imgOut
    '    If imgOut Is Nothing Then imgOut = New Bitmap(w, h)
    '    If imgOut.Width <> imgIn.Width Or imgOut.Height <> imgIn.Height Then
    '        imgOut = New Bitmap(w, h)
    '    End If
    '    ' ---------------------------------------------------- do the work
    '    Dim g As Graphics = Graphics.FromImage(imgOut)
    '    SetQuality(g, Quality)
    '    Dim rec As Rectangle = New Rectangle(0, 0, w, h)
    '    g.DrawImage(imgIn, rec, 0, 0, w, h, GraphicsUnit.Pixel, imgAttr)
    'End Sub

    'Friend Sub ImageGray(ByRef imgOut As Image, ByRef imgIn As Image, ByVal Quality As Int32)
    '    Dim w As Integer = imgIn.Width
    '    Dim h As Integer = imgIn.Height
    '    ' ---------------------------------------------------- the color matrix
    '    Dim cMatrix As ColorMatrix = New ColorMatrix(New Single()() _
    '                           {New Single() {0.299, 0.299, 0.299, 0, 0}, _
    '                            New Single() {0.587, 0.587, 0.587, 0, 0}, _
    '                            New Single() {0.114, 0.114, 0.114, 0, 0}, _
    '                            New Single() {0, 0, 0, 1, 0}, _
    '                            New Single() {0, 0, 0, 0, 1}})
    '    ' ---------------------------------------------------- ImageAttributes object
    '    Dim imgAttr As New ImageAttributes()
    '    imgAttr.SetColorMatrix(cMatrix)
    '    ' ---------------------------------------------------- init imgOut
    '    If imgOut Is Nothing Then imgOut = New Bitmap(w, h)
    '    If imgOut.Width <> imgIn.Width Or imgOut.Height <> imgIn.Height Then
    '        imgOut = New Bitmap(w, h)
    '    End If
    '    ' ---------------------------------------------------- do the work
    '    Dim g As Graphics = Graphics.FromImage(imgOut)
    '    SetQuality(g, Quality)
    '    Dim rec As Rectangle = New Rectangle(0, 0, w, h)
    '    g.DrawImage(imgIn, rec, 0, 0, w, h, GraphicsUnit.Pixel, imgAttr)
    'End Sub


    ' =============================================================================================
    '  ROTATIONS
    ' =============================================================================================
    'Public Function ImageRotate(ByRef img As Image, ByVal angle As Single) As Image
    '    Dim bmp As New Bitmap(img)
    '    Dim g As Graphics = Graphics.FromImage(bmp)
    '    ' --------------------------------------------------- rotate from the middle
    '    g.Clear(Color.White)
    '    g.ResetTransform()
    '    g.TranslateTransform(img.Width \ 2, img.Height \ 2)
    '    g.RotateTransform(angle)
    '    ' --------------------------------------------------- draw centered
    '    g.DrawImage(img, -bmp.Width \ 2, -bmp.Height \ 2)
    '    Return bmp
    'End Function

    'Public Sub ImageRotateInPlace(ByRef img As Image, ByVal angle As Single)
    '    Dim bmp As New Bitmap(img)
    '    Dim g As Graphics = Graphics.FromImage(img)
    '    ' --------------------------------------------------- rotate from the middle
    '    g.Clear(Color.White)
    '    g.ResetTransform()
    '    g.TranslateTransform(bmp.Width \ 2, bmp.Height \ 2)
    '    g.RotateTransform(angle)
    '    ' --------------------------------------------------- draw centered
    '    g.DrawImage(bmp, -img.Width \ 2, -img.Height \ 2)
    'End Sub




    ' ================================================================================
    '  MOTION DETECTOR
    ' ================================================================================

    'Private Declare Sub MotionDetector Lib "Videolib.dll" (ByVal start1 As IntPtr, _
    '                                                       ByVal start2 As IntPtr, _
    '                                                       ByVal height As Int32, _
    '                                                       ByVal width As Int32, _
    '                                                       ByVal offset As Int32, _
    '                                                       ByVal Shift As Int32, _
    '                                                       ByVal Gain As Int32, _
    '                                                       ByVal GrayScale As Int32, _
    '                                                       ByVal Invert As Int32, _
    '                                                       ByVal AllPositive As Int32, _
    '                                                       ByVal BlackOrWhite As Int32)


    'Friend Function Image_DetectMotion(ByVal Image1 As Image, _
    '                                    ByVal Image2 As Image, _
    '                                    ByVal Shift As Int32, _
    '                                    ByVal Gain As Int32, _
    '                                    ByVal GrayScale As Boolean, _
    '                                    ByVal Invert As Boolean, _
    '                                    ByVal AllPositive As Boolean, _
    '                                    ByVal BlackOrWhite As Boolean) As Image

    '    If Image1 Is Nothing Or Image2 Is Nothing Then Return Nothing
    '    If Image1.Width <> Image2.Width Or Image1.Height <> Image2.Height Then Return Nothing


    '    ' Dim t As PrecisionTimer = New PrecisionTimer



    '    Dim b1 As Bitmap = CType(Image1.Clone, Bitmap)
    '    Dim b2 As Bitmap = CType(Image2, Bitmap)




    '    Dim bmData1 As BitmapData = b1.LockBits(New Rectangle(0, 0, b1.Width, b1.Height), _
    '                                           ImageLockMode.ReadWrite, _
    '                                           PixelFormat.Format24bppRgb)

    '    Dim bmData2 As BitmapData = b2.LockBits(New Rectangle(0, 0, b2.Width, b2.Height), _
    '                                           ImageLockMode.ReadWrite, _
    '                                           PixelFormat.Format24bppRgb)

    '    If bmData1.Width <> bmData2.Width Or bmData1.Height <> bmData2.Height Or bmData1.Stride <> bmData2.Stride Then Return Nothing

    '    Dim nHeight As Int32 = bmData1.Height
    '    Dim nWidth As Int32 = bmData1.Width * 3
    '    Dim nOffset As Int32 = bmData1.Stride - nWidth

    '    'Debug.Print(nOffset.ToString)

    '    ' Dim t As PrecisionTimer = New PrecisionTimer
    '    Try

    '        MotionDetector(bmData1.Scan0, _
    '                       bmData2.Scan0, _
    '                       nHeight, _
    '                       nWidth, _
    '                       nOffset, _
    '                       Shift, _
    '                       Gain, _
    '                       CInt(GrayScale), _
    '                       CInt(Invert), _
    '                       CInt(AllPositive), _
    '                       CInt(BlackOrWhite))

    '    Catch ex As Exception
    '        'MsgBox(Image1.Width & " " & Image2.Width & " " & Image1.Height & " " & Image2.Height)
    '        'MsgBox(bmData1.Width & " " & bmData2.Width & " " & bmData1.Height & " " & bmData2.Height & " " & bmData1.Stride & " " & bmData2.Stride)
    '        'MsgBox(bmData1.Scan0.ToString & " " & bmData2.Scan0.ToString)
    '        'MsgBox(ex.ToString)
    '        'System.Threading.Thread.Sleep(5000)
    '    End Try

    '    'Form_Main.Text = t.GetTimeMicrosec.ToString

    '    '
    '    b1.UnlockBits(bmData1)
    '    b2.UnlockBits(bmData2)
    '    '

    '    'Form_Main.Text = t.GetTimeMicrosec.ToString
    '    If Form1.txt_PostFilterQuality.NumericValueInteger > 0 Then
    '        Return ImageResize(CType(b1, Image), 320, 240, Form1.txt_PostFilterQuality.NumericValueInteger)
    '    Else
    '        Return b1
    '    End If
    'End Function


    ' ================================================================================
    '  TEST BITMAP DATA
    ' ================================================================================

    'Private Declare Function TestBitmapData Lib "Videolib.dll" (ByVal start As IntPtr, _
    '                                                            ByVal height As Int32, _
    '                                                            ByVal width As Int32, _
    '                                                            ByVal offset As Int32, _
    '                                                            ByVal trigvalue As Int32) As Int32

    'Friend Function TestImage(ByVal img As Image, ByVal rec As Rectangle) As Boolean

    '    If img Is Nothing Then Return False
    '    If rec.Width < 2 Or rec.Height < 2 Then Return False

    '    If Not New Rectangle(0, 0, img.Width, img.Height).Contains(rec) Then Return False

    '    Dim b1 As Bitmap = CType(img, Bitmap)

    '    Dim bmData As BitmapData = b1.LockBits(rec, _
    '                                           ImageLockMode.ReadWrite, _
    '                                           PixelFormat.Format24bppRgb)

    '    Dim detected As Int32
    '    Dim nHeight As Int32 = bmData.Height
    '    Dim nWidth As Int32 = bmData.Width * 3
    '    Dim nOffset As Int32 = bmData.Stride - nWidth

    '    detected = TestBitmapData(bmData.Scan0, nHeight, nWidth, nOffset, 10)

    '    b1.UnlockBits(bmData)

    '    'Debug.Print(detected.ToString)

    '    Return detected > img.Width / 4
    'End Function


    'Private Sub ApplyZoom()

    '    Dim CenterPointer As Boolean = True

    '    Dim destW As Double = Form1.PictureBox1.Width
    '    Dim destH As Double = Form1.PictureBox1.Height
    '    Dim srcW As Double = Capture_Image.Width
    '    Dim srcH As Double = Capture_Image.Height

    '    Dim sx As Double
    '    Dim sy As Double
    '    Dim sw As Double = srcW
    '    Dim sh As Double = srcH

    '    Dim dx As Double
    '    Dim dy As Double
    '    Dim dw As Double
    '    Dim dh As Double

    '    Dim ZoomBase As Double = 1 'destW / srcW
    '    Dim Zoom As Double = Form1.txt_Zoom.NumericValue

    '    Dim x As Double = (Form1.txt_ShiftX.NumericValue / 200 + 0.5) * destW
    '    Dim y As Double = (Form1.txt_ShiftY.NumericValue / 200 + 0.5) * destH


    '    ZoomBase = destW / srcW
    '    If destH / srcH < ZoomBase Then ZoomBase = destH / srcH


    '    If destW = 0 Or destH = 0 Then Exit Sub

    '    If CenterPointer Then
    '        ' Trasformo le coordinate in quelle del pixel puntato dal mouse nella picture sorgente
    '        x = ((x - dx) * sw) / destW + sx
    '        y = ((y - dy) * sh) / destH + sy
    '    End If

    '    ' Preparo le dimensioni della immagine sorgente
    '    sw = srcW
    '    sh = srcH

    '    ' Applico lo zoom
    '    dw = sw * ZoomBase * Zoom
    '    dh = sh * ZoomBase * Zoom

    '    ' Controllo il clipping
    '    Dim k As Double
    '    k = dw / destW
    '    If k > 1 Then
    '        dw = dw / k
    '        sw = sw / k
    '    End If
    '    k = dh / destH
    '    If k > 1 Then
    '        dh = dh / k
    '        sh = sh / k
    '    End If

    '    '' Calcolo i bordi
    '    'dx = (destW - dw) / 2
    '    'dy = (destH - dh) / 2

    '    '' Cancello i bordi
    '    'If dx > 0 Then
    '    'Form2.Line (0, 0)-(dx, scrH), 0, BF
    '    'Form2.Line (scrW - dx, 0)-(scrW, scrH), 0, BF
    '    'End If
    '    'If dy > 0 Then
    '    'Form2.Line (0, 0)-(scrW, dy), 0, BF
    '    'Form2.Line (0, scrH - dy)-(scrW, scrH), 0, BF
    '    'Else
    '    'Form2.Line (0, 0)-(0, 0), 0, BF
    '    'End If

    '    ' Calcolo la posizione
    '    If CenterPointer Then
    '        sx = x - sw / 2
    '        sy = y - sh / 2
    '    Else
    '        sx = (x * (srcW - sw)) / destW
    '        sy = (y * (srcH - sh)) / destH
    '    End If

    '    ' Limito la posizione
    '    If sx < 0 Then sx = 0
    '    If sy < 0 Then sy = 0
    '    If sx + sw > srcW Then sx = srcW - sw
    '    If sy + sh > srcH Then sy = srcH - sh

    '    'Debug.Print(sx.ToString)

    '    image2 = ImageZoom_AllParams(Capture_Image, _
    '                                    CInt(sx), _
    '                                    CInt(sy), _
    '                                    CInt(sw), _
    '                                    CInt(sh), _
    '                                    CInt(dx), _
    '                                    CInt(dy), _
    '                                    CInt(dw), _
    '                                    CInt(dh), _
    '                                    1)



    '    'SetStretchBltMode(Form2.hDC, HALFTONE)
    '    'StretchBlt(Form2.hDC, dx, dy, dw, dh, Picture1.hDC, sx, sy, sw, sh, SRCCOPY)
    'End Sub


End Module
