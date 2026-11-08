// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "windows")]
    {
        // Enable WebGPU via Direct3D 12 and bypass GPU driver blocklist on Windows
        // (specifically enables WebGPU acceleration for AMD Radeon RX 400/500 series e.g. RX 570)
        let current_args = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
        let webgpu_flags = "--enable-unsafe-webgpu --use-webgpu-adapter=d3d12 --enable-features=WebGPU --ignore-gpu-blocklist";
        let new_args = if current_args.is_empty() {
            webgpu_flags.to_string()
        } else if !current_args.contains("--enable-unsafe-webgpu") {
            format!("{} {}", current_args, webgpu_flags)
        } else {
            current_args
        };
        // SAFETY: Called at the very start of main() before any threads or WebView2 instances are spawned.
        unsafe {
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", new_args);
        }
    }

    readestlib::run();
}
