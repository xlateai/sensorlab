// Rust core library for native iOS integration

use std::ffi::{CString, CStr};
use std::os::raw::c_char;

/// Hello world function that returns a C-compatible string
/// The caller is responsible for freeing the memory using rustcore_hello_free
#[no_mangle]
pub extern "C" fn rustcore_hello() -> *mut c_char {
    let message = "Hello from Rust! 🦀";
    match CString::new(message) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Free the memory allocated by rustcore_hello
#[no_mangle]
pub extern "C" fn rustcore_hello_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

