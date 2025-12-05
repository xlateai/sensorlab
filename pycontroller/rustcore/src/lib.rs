use std::ffi::CString;
use std::os::raw::c_char;

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

