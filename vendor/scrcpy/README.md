# scrcpy (bundled in the Windows build)

The Windows CI job downloads the official scrcpy release (Apache License 2.0,
https://github.com/Genymobile/scrcpy) into this folder before packaging, so the
installer ships `scrcpy.exe` and `adb.exe` for the Phone mirror & backup tab.
Nothing here is committed except this note. For local development, unzip
`scrcpy-win64-v3.1.zip` here or install scrcpy on your PATH.
