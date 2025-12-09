use mlx_rs::Array;
use std::sync::Mutex;
use std::collections::HashMap;

struct ConvolutionStateMLX {
    image_array: Option<Array>,
    kernel_array: Option<Array>,
    size: usize,
}

impl ConvolutionStateMLX {
    fn new() -> Self {
        Self {
            image_array: None,
            kernel_array: None,
            size: 0,
        }
    }
}

// Global state storage for MLX (keyed by context ID)
lazy_static::lazy_static! {
    static ref CONV_STATES_MLX: Mutex<HashMap<u64, ConvolutionStateMLX>> = Mutex::new(HashMap::new());
}

/// Initialize or update convolution state using MLX
/// Returns the image data in [R,G,B,R,G,B...] format
pub fn init_or_update_convolution_mlx(
    context_id: u64,
    image_data: &[f32],
    kernel_data: &[f32],
) -> Result<Vec<f32>, String> {
    const CHANNELS: usize = 3;
    const KERNEL_SIZE: usize = 3;
    
    // Validate dimensions
    if image_data.len() % CHANNELS != 0 || kernel_data.len() != KERNEL_SIZE * KERNEL_SIZE * CHANNELS {
        return Err("invalid dimensions".to_string());
    }
    
    let total_pixels = image_data.len() / CHANNELS;
    let size = (total_pixels as f64).sqrt() as usize;
    if size * size != total_pixels {
        return Err("image must be square".to_string());
    }
    
    // Create MLX arrays
    // Image: [height, width, channels] format
    // Use Array::from_slice to create from slice, then reshape
    let image_array = Array::from_slice(image_data, &[(size * size * CHANNELS) as i32])
        .reshape(&[size as i32, size as i32, CHANNELS as i32])
        .map_err(|e| format!("Failed to reshape image array: {:?}", e))?;
    
    // Kernel: reshape from [ky, kx, c] to [channels, kernel_size, kernel_size]
    let mut kernel_reshaped = vec![0.0f32; CHANNELS * KERNEL_SIZE * KERNEL_SIZE];
    for c in 0..CHANNELS {
        for ky in 0..KERNEL_SIZE {
            for kx in 0..KERNEL_SIZE {
                let src_idx = (ky * KERNEL_SIZE + kx) * CHANNELS + c;
                let dst_idx = c * KERNEL_SIZE * KERNEL_SIZE + ky * KERNEL_SIZE + kx;
                kernel_reshaped[dst_idx] = kernel_data[src_idx];
            }
        }
    }
    
    let kernel_array = Array::from_slice(&kernel_reshaped, &[(CHANNELS * KERNEL_SIZE * KERNEL_SIZE) as i32])
        .reshape(&[CHANNELS as i32, KERNEL_SIZE as i32, KERNEL_SIZE as i32])
        .map_err(|e| format!("Failed to reshape kernel array: {:?}", e))?;
    
    // Store state
    let image_clone = image_array.clone();
    let mut states = CONV_STATES_MLX.lock().unwrap();
    states.insert(context_id, ConvolutionStateMLX {
        image_array: Some(image_array),
        kernel_array: Some(kernel_array),
        size,
    });
    
    // Return current image data
    image_clone.eval();
    let output_slice: &[f32] = image_clone.as_slice();
    
    Ok(output_slice.to_vec())
}

/// Apply convolution step using MLX (in-place update)
/// Returns the new image data
pub fn step_convolution_mlx(context_id: u64) -> Result<Vec<f32>, String> {
    const CHANNELS: usize = 3;
    const KERNEL_SIZE: usize = 3;
    
    let mut states = CONV_STATES_MLX.lock().unwrap();
    let state = states.get_mut(&context_id)
        .ok_or_else(|| "context not found".to_string())?;
    
    let image_array = state.image_array.take()
        .ok_or_else(|| "image array not initialized".to_string())?;
    let kernel_array = state.kernel_array.as_ref()
        .ok_or_else(|| "kernel array not initialized".to_string())?;
    
    // Add batch dimension: [height, width, channels] -> [1, height, width, channels]
    let image_batched = image_array.expand_dims(0)
        .map_err(|e| format!("Failed to add batch dimension: {:?}", e))?;
    
    // Expand kernel: [channels, kernel_size, kernel_size] -> [channels, kernel_size, kernel_size, 1]
    let kernel_expanded = kernel_array.expand_dims(3)
        .map_err(|e| format!("Failed to expand kernel: {:?}", e))?;
    
    // Apply conv2d with padding=1 (same padding)
    use mlx_rs::ops;
    let output = ops::conv2d(
        &image_batched,
        &kernel_expanded,
        (1, 1),  // stride
        (1, 1),  // padding
        (1, 1),  // dilation
        Some(CHANNELS as i32), // groups (for depthwise)
    )
    .map_err(|e| format!("Failed to apply conv2d: {:?}", e))?;
    
    // Remove batch dimension: [1, height, width, channels] -> [height, width, channels]
    let output_3d = output.squeeze()
        .map_err(|e| format!("Failed to remove batch dimension: {:?}", e))?;
    
    // Store updated array
    state.image_array = Some(output_3d.clone());
    
    // Evaluate and convert to Vec<f32>
    output_3d.eval();
    let output_slice: &[f32] = output_3d.as_slice();
    
    Ok(output_slice.to_vec())
}

/// Get current image data without applying convolution
pub fn get_image_mlx(context_id: u64) -> Result<Vec<f32>, String> {
    let states = CONV_STATES_MLX.lock().unwrap();
    let state = states.get(&context_id)
        .ok_or_else(|| "context not found".to_string())?;
    
    let image_array = state.image_array.as_ref()
        .ok_or_else(|| "image array not initialized".to_string())?;
    
    // Evaluate and convert to Vec<f32>
    image_array.eval();
    let output_slice: &[f32] = image_array.as_slice();
    
    Ok(output_slice.to_vec())
}

/// Clean up MLX state
pub fn cleanup_convolution_mlx(context_id: u64) {
    let mut states = CONV_STATES_MLX.lock().unwrap();
    states.remove(&context_id);
}
