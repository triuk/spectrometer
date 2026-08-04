Namespace My

    ' The following events are available for MyApplication:
    ' 
    ' Startup: Raised when the application starts, before the startup form is created.
    ' Shutdown: Raised after all application forms are closed.  This event is not raised if the application terminates abnormally.
    ' UnhandledException: Raised if the application encounters an unhandled exception.
    ' StartupNextInstance: Raised when launching a single-instance application and the application is already active. 
    ' NetworkAvailabilityChanged: Raised when the network connection is connected or disconnected.
    Partial Friend Class MyApplication

        Private Sub MyApplication_Startup(ByVal sender As Object, ByVal e As Microsoft.VisualBasic.ApplicationServices.StartupEventArgs) Handles Me.Startup
            AddAssemblyResolveHandler()
        End Sub

        Private Sub AddAssemblyResolveHandler()
            AddHandler AppDomain.CurrentDomain.AssemblyResolve, AddressOf LoadDLLFromStream
        End Sub


        ' ================================================================================================
        '  Embedded DLL loader
        ' ================================================================================================
        '  Open " Project / Properties / Application " and press "View Application Events"
        '  Open file "ApplicationEvents.vb" and select "MyApplication Events" in the upper left combo
        '  In the upper right combo select the event "Startup" 
        '  In the "MyApplication_Startup" event  add the call to "AddAssemblyResolveHandler()"
        '  Copy the "Embedded DLL Loader" after the "Startup" event and before the "End Class"
        '  The DLL must be one of the project files with "Build action" = "Embedded resource" 
        '  Ensure also the DLL property "Copy to output" = "Do not copy"
        '  If the DLL contains controls add the DLL in the references with "Copy local" = "False"
        ' ================================================================================================
        Private Function LoadDLLFromStream(ByVal sender As Object, _
                                     ByVal args As System.ResolveEventArgs) As System.Reflection.Assembly

            Dim resourceName As String
            resourceName = Application.Info.AssemblyName & "."
            resourceName &= New System.Reflection.AssemblyName(args.Name).Name & ".dll"

            Using stream As System.IO.Stream = _
                 System.Reflection.Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName)
                Dim assemblyData(CInt(stream.Length - 1)) As Byte
                stream.Read(assemblyData, 0, assemblyData.Length)
                Return System.Reflection.Assembly.Load(assemblyData)
            End Using
        End Function
        ' ================================================================================================

    End Class

End Namespace

