use std::ffi::CString;
use std::os::raw::c_char;
use serde::{Deserialize, Serialize};

mod helloworld;
mod convolution;

#[derive(Serialize, Deserialize)]
struct ConvolutionInput {
    image: Vec<f32>,
    kernel: Vec<f32>,
}

#[derive(Serialize, Deserialize)]
struct ConvolutionOutput {
    result: Vec<f32>,
}

/// Hello world function that returns a C-compatible string
/// The caller is responsible for freeing the memory using rustcore_hello_free
#[unsafe(no_mangle)]
pub extern "C" fn rustcore_hello() -> *mut c_char {
    let s = CString::new("Hello from Rust! 🦀").expect("CString::new failed");
    s.into_raw()
}

/// Free the memory allocated by rustcore_hello
#[unsafe(no_mangle)]
pub extern "C" fn rustcore_hello_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

/// Run ML training and return output as a C-compatible string
/// The caller is responsible for freeing the memory using rustcore_ml_training_free
#[unsafe(no_mangle)]
pub extern "C" fn rustcore_ml_training() -> *mut c_char {
    let output = helloworld::run_training();
    let s = CString::new(output).expect("CString::new failed");
    s.into_raw()
}

/// Free the memory allocated by rustcore_ml_training
#[unsafe(no_mangle)]
pub extern "C" fn rustcore_ml_training_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

/// Apply convolution to image data
/// Takes JSON string with {"image": [f32...], "kernel": [f32...]}
/// Returns JSON string with {"result": [f32...]}
/// Note: This function does NOT take ownership of input_json - caller must free it separately
#[unsafe(no_mangle)]
pub extern "C" fn rustcore_convolution(input_json: *const c_char) -> *mut c_char {
    unsafe {
        if input_json.is_null() {
            let err = CString::new(r#"{"error":"null input"}"#).unwrap();
            return err.into_raw();
        }
        
        let input_str = match std::ffi::CStr::from_ptr(input_json).to_str() {
            Ok(s) => s,
            Err(_) => {
                let err = CString::new(r#"{"error":"invalid string"}"#).unwrap();
                return err.into_raw();
            }
        };
        
        let input: ConvolutionInput = match serde_json::from_str(input_str) {
            Ok(data) => data,
            Err(e) => {
                let err = CString::new(format!(r#"{{"error":"parse error: {}"}}"#, e)).unwrap();
                return err.into_raw();
            }
        };
        
        // Validate dimensions (support any square size, but kernel must be 3x3x3 = 27)
        if input.image.len() % 3 != 0 || input.kernel.len() != 27 {
            let err = CString::new(r#"{"error":"invalid dimensions: image must be RGB (multiple of 3), kernel must be 27"}"#).unwrap();
            return err.into_raw();
        }
        
        // Verify it's a square image (total pixels must be a perfect square)
        let total_pixels = input.image.len() / 3;
        let width = (total_pixels as f64).sqrt() as usize;
        if width * width != total_pixels {
            let err = CString::new(format!(r#"{{"error":"image must be square (got {} pixels, not a perfect square)"}}"#, total_pixels)).unwrap();
            return err.into_raw();
        }
        
        let result = convolution::apply_convolution(&input.image, &input.kernel);
        
        let output = ConvolutionOutput { result };
        let result_json = match serde_json::to_string(&output) {
            Ok(json) => json,
            Err(e) => {
                let err = CString::new(format!(r#"{{"error":"serialize error: {}"}}"#, e)).unwrap();
                return err.into_raw();
            }
        };
        
        CString::new(result_json).unwrap().into_raw()
    }
}

/// Free memory allocated by rustcore_convolution
#[unsafe(no_mangle)]
pub extern "C" fn rustcore_convolution_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

