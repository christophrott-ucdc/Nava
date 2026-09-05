# Read-only Windows display inventory. No mode, registry or execution-policy changes.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NavaDisplayInventory {
  [StructLayout(LayoutKind.Sequential)] public struct Luid { public uint Low; public int High; }
  [StructLayout(LayoutKind.Sequential)] public struct Rational { public uint Num; public uint Den; }
  [StructLayout(LayoutKind.Sequential)] public struct Source { public Luid Adapter; public uint Id; public uint Mode; public uint Flags; }
  [StructLayout(LayoutKind.Sequential)] public struct Target { public Luid Adapter; public uint Id; public uint Mode; public uint Technology; public uint Rotation; public uint Scaling; public Rational Refresh; public uint Scan; public int Available; public uint Flags; }
  [StructLayout(LayoutKind.Sequential)] public struct PathInfo { public Source Source; public Target Target; public uint Flags; }
  [StructLayout(LayoutKind.Explicit, Size=64)] public struct ModeInfo { [FieldOffset(0)] public uint Type; }
  [StructLayout(LayoutKind.Sequential)] public struct Header { public uint Type; public uint Size; public Luid Adapter; public uint Id; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct SourceName { public Header Header; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string Name; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct TargetName { public Header Header; public uint Flags; public uint Technology; public ushort Manufacturer; public ushort Product; public uint Connector; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=64)] public string Friendly; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DevicePath; }
  [DllImport("user32.dll")] public static extern int GetDisplayConfigBufferSizes(uint flags,out uint paths,out uint modes);
  [DllImport("user32.dll")] public static extern int QueryDisplayConfig(uint flags,ref uint paths,[Out] PathInfo[] data,ref uint modes,[Out] ModeInfo[] modeData,IntPtr topology);
  [DllImport("user32.dll",EntryPoint="DisplayConfigGetDeviceInfo")] public static extern int GetSource(ref SourceName name);
  [DllImport("user32.dll",EntryPoint="DisplayConfigGetDeviceInfo")] public static extern int GetTarget(ref TargetName name);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  public static SourceName SourceRequest(Source source) { return new SourceName { Header = new Header { Type=1, Size=(uint)Marshal.SizeOf(typeof(SourceName)), Adapter=source.Adapter, Id=source.Id } }; }
  public static TargetName TargetRequest(Target target) { return new TargetName { Header = new Header { Type=2, Size=(uint)Marshal.SizeOf(typeof(TargetName)), Adapter=target.Adapter, Id=target.Id } }; }
}
'@
# This affects only this helper process, so Screen.Bounds is in physical pixels.
[void][NavaDisplayInventory]::SetProcessDpiAwarenessContext([IntPtr](-4))
Add-Type -AssemblyName System.Windows.Forms
$navaScreens = [System.Windows.Forms.Screen]::AllScreens
$navaIds = @(Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue)
$navaSizes = @(Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBasicDisplayParams -ErrorAction SilentlyContinue)
function Read-NavaText($bytes) { if ($null -eq $bytes) { return '' }; return -join @($bytes | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) }
function Read-NavaKey([string]$value) { return (($value -replace '^\\\\\?\\','' -replace '#','\' -replace '\\\{.*$','' -replace '_\d+$','').ToUpperInvariant()) }
$navaRows = @()
for ($navaAttempt = 0; $navaAttempt -lt 3; $navaAttempt++) {
  [uint32]$navaPathCount = 0; [uint32]$navaModeCount = 0
  $navaResult = [NavaDisplayInventory]::GetDisplayConfigBufferSizes(2, [ref]$navaPathCount, [ref]$navaModeCount)
  if ($navaResult -ne 0) { throw "GetDisplayConfigBufferSizes failed: $navaResult" }
  $navaPaths = [NavaDisplayInventory+PathInfo[]]::new($navaPathCount)
  $navaModes = [NavaDisplayInventory+ModeInfo[]]::new($navaModeCount)
  $navaResult = [NavaDisplayInventory]::QueryDisplayConfig(2,[ref]$navaPathCount,$navaPaths,[ref]$navaModeCount,$navaModes,[IntPtr]::Zero)
  if ($navaResult -eq 122) { continue }
  if ($navaResult -ne 0) { throw "QueryDisplayConfig failed: $navaResult" }
  for ($navaIndex = 0; $navaIndex -lt $navaPathCount; $navaIndex++) {
    $navaPath = $navaPaths[$navaIndex]
    $navaSource = [NavaDisplayInventory]::SourceRequest($navaPath.Source)
    $navaTarget = [NavaDisplayInventory]::TargetRequest($navaPath.Target)
    if ([NavaDisplayInventory]::GetSource([ref]$navaSource) -ne 0 -or [NavaDisplayInventory]::GetTarget([ref]$navaTarget) -ne 0) { continue }
    $navaScreen = @($navaScreens | Where-Object { $_.DeviceName -eq $navaSource.Name })
    if ($navaScreen.Count -ne 1) { continue }
    $navaKey = Read-NavaKey $navaTarget.DevicePath
    $navaId = @($navaIds | Where-Object { (Read-NavaKey $_.InstanceName) -eq $navaKey })
    $navaSize = @($navaSizes | Where-Object { (Read-NavaKey $_.InstanceName) -eq $navaKey })
    $navaSerial = ''; $navaManufacturer = ''; $navaWidth = 0; $navaHeight = 0
    if ($navaId.Count -eq 1) { $navaSerial = Read-NavaText $navaId[0].SerialNumberID; $navaManufacturer = Read-NavaText $navaId[0].ManufacturerName }
    if ($navaSize.Count -eq 1) { $navaWidth = [int]$navaSize[0].MaxHorizontalImageSize * 10; $navaHeight = [int]$navaSize[0].MaxVerticalImageSize * 10 }
    $navaBounds = $navaScreen[0].Bounds
    $navaRows += [ordered]@{sourcePath=$navaSource.Name;devicePath=$navaTarget.DevicePath;label=$navaTarget.Friendly;serial=$navaSerial;manufacturer=$navaManufacturer;pixelBounds=@{x=$navaBounds.X;y=$navaBounds.Y;width=$navaBounds.Width;height=$navaBounds.Height};physicalWidthMm=$navaWidth;physicalHeightMm=$navaHeight;technology=[uint32]$navaPath.Target.Technology}
  }
  break
}
if ($navaResult -ne 0) { throw 'Display topology changed during inventory.' }
ConvertTo-Json -InputObject ([ordered]@{schemaVersion=1;displays=@($navaRows)}) -Depth 6 -Compress
