use burn::tensor::Tensor;
use burn_ndarray::NdArray;
use std::sync::Mutex;
use std::collections::HashMap;

type BackendType = NdArray<f32>;

struct ConvolutionState {
    image_tensor: Option<Tensor<BackendType, 4>>,
    kernel_tensor: Option<Tensor<BackendType, 4>>,
    size: usize,
    device: burn_ndarray::NdArrayDevice,
}

impl ConvolutionState {
    fn new() -> Self {
        Self {
            image_tensor: None,
            kernel_tensor: None,
            size: 0,
            device: Default::default(),
        }
    }
}

// Global state storage (keyed by context ID for potential multi-instance support)
lazy_static::lazy_static! {
    static ref CONV_STATES: Mutex<HashMap<u64, ConvolutionState>> = Mutex::new(HashMap::new());
}

/// Initialize or update convolution state
/// Returns the image data in [R,G,B,R,G,B...] format
pub fn init_or_update_convolution(
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
    
    let device = Default::default();
    
    // Convert image from [H,W,C] to [1,C,H,W] using Burn's reshape
    // Input: [R,G,B,R,G,B,...] = [H*W*C] in [H,W,C] format
    // We need to permute to [C,H,W] then add batch dimension
    // Create tensor as [H*W*C], reshape to [H,W,C], then permute/reshape to [1,C,H,W]
    let image_tensor = Tensor::<BackendType, 1>::from_floats(image_data, &device)
        .reshape([size, size, CHANNELS])
        .permute([2, 0, 1])  // [C, H, W]
        .unsqueeze_dim(0);   // [1, C, H, W]
    
    // Convert kernel from [ky,kx,c] to [C,1,K,K] for depthwise
    // Input: [ky*K*C + kx*C + c] = [K*K*C]
    // Output: [C,1,K,K] where each channel gets its own 3x3 kernel
    let kernel_reshaped: Vec<f32> = (0..CHANNELS)
        .flat_map(|c| {
            (0..KERNEL_SIZE).flat_map(move |ky| {
                (0..KERNEL_SIZE).map(move |kx| {
                    let src_idx = (ky * KERNEL_SIZE + kx) * CHANNELS + c;
                    kernel_data[src_idx]
                })
            })
        })
        .collect();
    
    let kernel_tensor = Tensor::<BackendType, 1>::from_floats(kernel_reshaped.as_slice(), &device)
        .reshape([CHANNELS, 1, KERNEL_SIZE, KERNEL_SIZE]);
    
    // Store state (clone image_tensor before moving it)
    let image_tensor_clone = image_tensor.clone();
    let mut states = CONV_STATES.lock().unwrap();
    states.insert(context_id, ConvolutionState {
        image_tensor: Some(image_tensor),
        kernel_tensor: Some(kernel_tensor),
        size,
        device,
    });
    
    // Return current image data - convert from [1,C,H,W] back to [H,W,C]
    let output_3d = image_tensor_clone.squeeze_dim(0); // [C, H, W]
    let output_hwc = output_3d.permute([1, 2, 0]); // [H, W, C]
    let output_data = output_hwc.into_data();
    let output_slice = output_data.as_slice::<f32>().unwrap();
    let result = output_slice.to_vec();
    
    Ok(result)
}

/// Apply convolution step (in-place update)
/// Returns the new image data
pub fn step_convolution(context_id: u64) -> Result<Vec<f32>, String> {
    const CHANNELS: usize = 3;
    
    let mut states = CONV_STATES.lock().unwrap();
    let state = states.get_mut(&context_id)
        .ok_or_else(|| "context not found".to_string())?;
    
    let image_tensor = state.image_tensor.take()
        .ok_or_else(|| "image tensor not initialized".to_string())?;
    let kernel_tensor = state.kernel_tensor.as_ref()
        .ok_or_else(|| "kernel tensor not initialized".to_string())?;
    
    // Apply conv2d with same padding
    use burn::tensor::module::conv2d;
    use burn::tensor::ops::ConvOptions;
    let options = ConvOptions::new([1, 1], [1, 1], [1, 1], CHANNELS);
    
    let output_tensor = conv2d(image_tensor, kernel_tensor.clone(), None, options);
    
    // Store updated tensor
    state.image_tensor = Some(output_tensor.clone());
    
    // Convert back to flat array [R, G, B, R, G, B, ...] using Burn operations
    let output_3d = output_tensor.squeeze_dim(0); // [C, H, W]
    let output_hwc = output_3d.permute([1, 2, 0]); // [H, W, C]
    let output_data = output_hwc.into_data();
    let output_slice = output_data.as_slice::<f32>().unwrap();
    let result = output_slice.to_vec();
    
    Ok(result)
}

/// Clean up state
pub fn cleanup_convolution(context_id: u64) {
    let mut states = CONV_STATES.lock().unwrap();
    states.remove(&context_id);
}

