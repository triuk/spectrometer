
Imports System.Runtime.InteropServices

' ============================================================================================
'  Module Theremino Strings  
' ============================================================================================
Module Theremino_Strings
    Friend StringSlots As ThereminoStrings = New ThereminoStrings
End Module

' ============================================================================================
'  Class Theremino Strings  
'  -------------------------------------------------------------------------------------------
'  File names are TTS0 to TTS999 (TTS = Theremino String Slots) 
'  Strings are written as unicode characters valid for many languages (chinese for example)
'  The maximum number of bytes is fixed to 65536 so the max string length is 32768
' ============================================================================================
Class ThereminoStrings

    Private FileHandle(999) As Int32
    Private FileLength(999) As Int32
    Private MappingAddr(999) As IntPtr
    Private MappingLength(999) As Int32

    Protected Overrides Sub Finalize()
        DestroyAll()
        MyBase.Finalize()
    End Sub
    Private Sub DestroyAll()
        For slot As Int32 = 0 To 999
            UnmapAndCloseHandle(slot)
        Next
    End Sub

    Private Sub UnmapAndCloseHandle(ByVal Slot As Int32)
        If MappingAddr(Slot) <> IntPtr.Zero Then
            UnmapViewOfFile(MappingAddr(Slot))
        End If
        If FileHandle(Slot) <> 0 Then
            CloseHandle(FileHandle(Slot))
            FileHandle(Slot) = 0
        End If
    End Sub


    ' ===================================================================================================
    '  MAX LENGTH FIXED (100000 Unicode Chars)
    ' ===================================================================================================
    Friend Sub WriteString(ByVal Slot As Int32, ByVal Text As String)
        If Slot < 0 OrElse Slot > 999 Then Return
        If Text Is Nothing Then Return
        '
        If Text.Length > 100000 Then
            Text = "Text too long (max = 100000)"
        End If
        '
        Dim ba As Byte() = System.Text.Encoding.Unicode.GetBytes(Text + Chr(0) + Chr(0))
        '
        FileHandle(Slot) = CreateFileMapping(INVALID_HANDLE_VALUE, _
                                             Nothing, _
                                             PAGE_READWRITE, _
                                             0, _
                                             200008, _
                                             "ThereminoSS" + Slot.ToString())
        '
        If MappingAddr(Slot) = IntPtr.Zero Then
            MappingAddr(Slot) = MapViewOfFile(FileHandle(Slot), _
                                              FILE_MAP_ALL_ACCESS, _
                                              0, 0, 200008)
        End If
        '
        If MappingAddr(Slot) = IntPtr.Zero Then Return
        '
        Marshal.Copy(ba, 0, MappingAddr(Slot), ba.Length())
    End Sub

    Friend Function ReadString(ByVal Slot As Int32) As String
        If Slot < 0 OrElse Slot > 999 Then Return ""
        '
        FileHandle(Slot) = OpenFileMapping(PAGE_READONLY, _
                                           0, _
                                           "ThereminoSS" + Slot.ToString())
        '
        If MappingAddr(Slot) = IntPtr.Zero Then
            MappingAddr(Slot) = MapViewOfFile(FileHandle(Slot), _
                                              FILE_MAP_ALL_ACCESS, _
                                              0, 0, 0)
        End If
        '
        If MappingAddr(Slot) = IntPtr.Zero Then Return ""
        '
        ReadString = Marshal.PtrToStringUni(MappingAddr(Slot))
    End Function


    ' ---------------------------------------------------------------- declararations
    Private Structure SECURITY_ATTRIBUTES
        Const nLength As Int32 = 12
        Public lpSecurityDescriptor As Int32
        Public bInheritHandle As Int32
    End Structure

    Private Declare Function CloseHandle Lib "Kernel32" (ByVal intPtrFileHandle As Int32) As Boolean

    Private Declare Function CreateFileMapping Lib "Kernel32" _
                                               Alias "CreateFileMappingA" _
                                               (ByVal hFile As Int32, _
                                                ByRef lpFileMappigAttributes As SECURITY_ATTRIBUTES, _
                                                ByVal flProtect As Int32, _
                                                ByVal dwMaximumSizeHigh As Int32, _
                                                ByVal dwMaximumSizeLow As Int32, _
                                                ByVal lpname As String) As Int32

    Private Declare Function OpenFileMapping Lib "Kernel32" _
                                                Alias "OpenFileMappingA" _
                                                (ByVal dwDesiredAccess As Int32, _
                                                 ByVal bInheritHandle As Int32, _
                                                 ByVal lpname As String) As Int32

    Private Declare Function MapViewOfFile Lib "Kernel32" _
                                            (ByVal hFileMappingObject As Int32, _
                                             ByVal dwDesiredAccess As Int32, _
                                             ByVal dwFileOffsetHigh As Int32, _
                                             ByVal dwFileOffsetLow As Int32, _
                                             ByVal dwNumberOfBytesToMap As Int32) As IntPtr

    Private Declare Function UnmapViewOfFile Lib "Kernel32" _
                                            (ByVal lpBaseAddress As IntPtr) As Int32

    Private Const PAGE_READONLY As Int32 = 2
    Private Const PAGE_READWRITE As Int32 = 4
    Private Const FILE_MAP_ALL_ACCESS As Int32 = 1 Or 2 Or 4 Or 8 Or &H10 Or &HF0000
    Private Const INVALID_HANDLE_VALUE As Int32 = -1

End Class

