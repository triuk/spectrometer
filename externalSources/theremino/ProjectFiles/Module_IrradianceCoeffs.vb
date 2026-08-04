Module Module_IrradianceCoeffs

    ' TODO IRRADIANCE 2

    Friend Irradiance_Nanometers(-1) As Double
    Friend Irradiance_Coefficents(-1) As Double

    Dim coeff As Double
    Friend Sub CorrectForIrradiance(ByRef ar() As Single)
        If Irradiance_Nanometers.Length < 2 Then Return
        For i As Int32 = 0 To SENSOR_NumSamples - 1
            coeff = Interpolate(Irradiance_Nanometers, Irradiance_Coefficents, X_To_Nanometers(BinToX(i)))
            ar(i) *= CSng(coeff)
        Next
    End Sub

End Module
