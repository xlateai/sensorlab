use std::ffi::CString;
use std::os::raw::c_char;

mod helloworld;

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

