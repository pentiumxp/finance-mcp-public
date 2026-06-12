# Finance PWA And Mobile Harness

## Hard Rule

Mobile Finance validation must distinguish installed PWA mode from browser mode.

Use installed PWA evidence for changes that touch:

- mobile Finance functionality;
- Hermes embedded-plugin entry, iframe navigation, and back behavior;
- service worker, cache, manifest, PWA restore, Web Push, or notification routing;
- file, image, attachment, receipt, or preview behavior;
- same-origin proxy/resource behavior for Hermes Mobile.

Opening a Finance or Hermes URL directly in Chrome/Safari address bar is browser-mode diagnosis only. It is not PWA pass/fail evidence.

## Required Installed-PWA Flow

For Android emulator or device validation:

```powershell
adb devices
npm run verify:pwa:android -- --install
```

The Harness must:

1. confirm an emulator/device is connected;
2. install or refresh the Finance PWA shortcut when `--install` is used;
3. return to the Android Launcher;
4. start Finance by tapping the Launcher PWA icon, not by `adb am start -d <url>`;
5. capture UI XML and screenshot evidence;
6. fail if Chrome toolbar/address-bar UI is present unless `--allow-shortcut` is explicitly used for diagnosis.

Verify an existing installed PWA shortcut:

```powershell
npm run verify:pwa:android
```

Use a specific device:

```powershell
$env:ADB_SERIAL='<device-id>'
npm run verify:pwa:android
Remove-Item Env:\ADB_SERIAL
```

Chrome may label the install menu as either `Install app` or `Add to Home Screen` depending on Android Chrome version and WebAPK state. The label alone is not the pass/fail criterion. The pass/fail criterion is the later Launcher launch: it must open without Chrome toolbar/address-bar UI unless `--allow-shortcut` is being used for diagnosis.

On Samsung One UI / localized Chrome, Chrome may show a Chinese two-step flow:

1. `添加到主屏幕`
2. `安装`
3. final `安装应用` confirmation

The Android Harness recognizes that flow by Chrome resource ids such as `option_install` and `positive_button`; do not bypass it with manual browser-mode launch evidence.

For physical-device PWA installation, prefer a browser-facing HTTPS origin that the phone and Chrome WebAPK installer can reach directly. `http://127.0.0.1:<port>` via `adb reverse` and trusted-LAN `http://192.168.x.x:<port>` are valid browser-mode diagnostics, but they may stall at Chrome/WebAPK installation on real devices and fail to create a Launcher WebAPK icon. Treat that as a PWA install failure, not as a Finance UI rendering failure. This explains why a Hermes Mobile HTTPS PWA can install successfully on the same phone while local HTTP Finance does not.

If an old Chrome-created shortcut named `Finance` is pinned, clear Chrome shortcuts before reinstalling:

```powershell
npm run verify:pwa:android -- --clear-chrome-shortcuts --install
```

`--allow-shortcut` is diagnostic only. Do not record it as a release-quality PWA pass.

## Evidence Fields

Every mobile/PWA fix must report:

- emulator/device id;
- whether the Finance PWA shortcut was installed/refreshed or reused;
- launch method: must be `Launcher PWA icon`;
- screenshot path;
- page or feature verified;
- failure class when failed:
  - `browser-mode failure`
  - `PWA failure`
  - `plugin iframe failure`
  - `proxy/resource failure`
  - `device failure`

Screenshots must show that the page is in standalone PWA shell and does not show the browser address bar.

Artifacts are written under:

```text
data/finance-pwa-screenshots/
```

This directory is ignored by Git.

## Script Entry Points

Android installed-PWA gate:

```powershell
npm run verify:pwa:android -- --install
```

Desktop mobile-viewport render harness:

```powershell
npm run verify:pwa:desktop
```

Android Wacai visual comparison:

```powershell
npm run verify:entry-android
```

The desktop and Wacai comparison harnesses are useful layout evidence, but they do not replace installed mobile PWA evidence when the task affects mobile PWA behavior.

## Finance Plugin Verification Points

When validating Finance as a Hermes Mobile embedded-app plugin, include:

- standalone Finance PWA launches from the desktop/Launcher PWA icon;
- Hermes Mobile can load the Finance plugin iframe without a manifest error;
- Finance plugin root page is not covered by Hermes input or bottom tab UI;
- Finance plugin secondary pages satisfy the embedded-app back contract;
- if Hermes same-origin proxy is used, static assets, images, API URLs, and attachments are browser-facing and do not point to inaccessible local/upstream URLs.

## UIAutomator And WebView Limits

If UIAutomator only exposes a generic WebView, DevTools or WebView state may be used as supporting evidence. Record only bounded state:

- active route/view name;
- display mode;
- viewport size;
- presence/absence of browser toolbar;
- bounded DOM/UI selector status;
- screenshot path.

Do not record raw workspace keys, launch tokens, cookies, push endpoints, bank account numbers, complete bill contents, receipt image text, raw model output, or long logs.

## Browser-Mode Diagnostics

These commands may diagnose installability or resource loading, but they are not PWA pass/fail gates:

```powershell
adb shell am start -d http://127.0.0.1:8791/finance.html
```

Chrome/Safari address-bar success only proves browser-mode loading. It does not prove installed PWA storage, service worker, navigation, restore, or iframe behavior.
