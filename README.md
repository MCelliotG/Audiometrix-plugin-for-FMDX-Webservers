# Audiometrix-plugin-for-FMDX-Webservers
Audiometrix plugin for FMDX Webservers

🎧 AudioMetrix

AudioMetrix is a real-time audio visualization plugin for the FM-DX Webserver.


It transforms raw audio data into smooth, responsive, and visually rich meters — combining accurate signal feedback with high-quality eye candy.

It is designed as a hybrid metering system, offering both technical insight and aesthetic presentation.

👁️ Why use it?
- Instantly understand your audio signal
- Detect peaks, silence, and stereo width in real time
- Enhance your FM-DX interface visually
- Enjoy fluid animations with minimal performance cost

👉 Better insight. Better visuals. Zero compromise.

🎨 Visual Modes & Layouts

🔹 Layouts
- LR (Stereo Levels)
  
  ![amx1](https://github.com/user-attachments/assets/c49b8dd5-2f16-410a-bfd7-095c31172c23)
  
  Classic left/right metering
  
- SA (Stereo Quality + Audio Peak)
  
  ![amx2](https://github.com/user-attachments/assets/9f5d6241-f2e6-4515-b885-28043c55a946)
  
  Advanced signal analysis
  
- FULL
  
  ![amx3](https://github.com/user-attachments/assets/b2be283e-8a6e-4cfa-b952-2194bfabd010)
  
  Combined multi-row view (L/R + Q/A)
  
🔹 Render Modes
- Bars — clean, linear meters
  
  ![amx4](https://github.com/user-attachments/assets/055cbd26-acab-4369-ba32-f8309835d648)

- Gauges — analog-style circular meters
  ![amx5](https://github.com/user-attachments/assets/0cb44e01-9e22-46d8-b1e0-c9758dfbf7bd)

- Mirrored — symmetrical dual-channel display
  
  ![amx6](https://github.com/user-attachments/assets/8f42ac97-0657-477b-8647-6c893f6473f3)


All modes share the same underlying data — only the presentation changes.

🎛️ Styles

AudioMetrix supports multiple visual styles:

- Simple bars
  
- Segmented bars
- Circle Dots
- Matrix Dots
- Pillars
- Beveled 3D
- Glass Tube

Each style represents the same signal with a different visual interpretation.

🌈 Features
- Real-time RMS + peak metering
- Stereo quality (Q) visualization
- Audio peak (A) tracking with hold/decay
- Adaptive rendering cadence
- Gradient-based visual zones (peak awareness)
- Optional glow effects
- Theme-aware color adaptation
- Fully responsive canvas rendering

⚙️ Settings & Customization
AudioMetrix includes a floating control panel.

You can adjust:
- Layout mode (LR / SA / FULL)
- Render mode (Bars / Gauges / Mirrored)
- Visual style
- Glow effect
- Gain / sensitivity
- Peak hold & decay
- Readouts visibility

All changes apply instantly in real time.

🧭 How to Open Settings
- Locate the AudioMetrix panel in the FM-DX interface
- Click the settings icon / panel trigger
- The floating panel will appear
- Adjust settings live

⚡ Performance
AudioMetrix is optimized for efficiency:

- Optimized render pipeline
- Smart gradient caching
- Reduced hot-path overhead
- Adaptive audio update cadence

👉 Result: smooth visuals with low CPU usage

📱 Compatibility
- Desktop browsers (full performance)
- Mobile devices (optimized behavior)
- Compatible with all FM-DX Webserver themes

🧪 Notes
- All modes display the same underlying data
- Differences are purely visual
- Peak behavior is consistent across layouts
- No artificial smoothing beyond configured parameters
  
🚀 Tips
- Use FULL + Mirrored for maximum visual detail
- Enable Glow for depth and contrast
- Use SA layout to monitor stereo quality live
- Adjust gain carefully to avoid constant peak saturation
- 
🧩 Version

AudioMetrix 4.0
