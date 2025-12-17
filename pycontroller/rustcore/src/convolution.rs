use burn::tensor::Tensor;
use burn_ndarray::NdArray;

type BackendType = NdArray<f32>;

/// Apply 3D convolution to an RGB image using Burn's conv2d with same padding
/// 
/// # Arguments
/// * `image_data` - Flat array of RGB values: [R, G, B, R, G, B, ...] 
/// * `kernel_data` - 3x3x3 kernel as flat array (27 values), organized as [ky, kx, channel]
/// 
/// # Returns
/// Flat array of convolved RGB values
pub fn apply_convolution(image_data: &[f32], kernel_data: &[f32]) -> Vec<f32> {
    const CHANNELS: usize = 3;
    const KERNEL_SIZE: usize = 3;
    
    // Calculate dimensions from data length
    let total_pixels = image_data.len() / CHANNELS;
    let size = (total_pixels as f64).sqrt() as usize;
    let height = size;
    let width = size;
    
    let device = Default::default();
    
    // Reshape image to [batch=1, channels=3, height, width]
    // Image data is [R, G, B, R, G, B, ...] which is [height, width, channels] in row-major
    // Need to convert to [batch, channels, height, width]
    let mut image_chw = vec![0.0f32; image_data.len()];
    for y in 0..height {
        for x in 0..width {
            for c in 0..CHANNELS {
                let src_idx = (y * width + x) * CHANNELS + c;
                let dst_idx = c * height * width + y * width + x;
                image_chw[dst_idx] = image_data[src_idx];
            }
        }
    }
    
    let image_tensor = Tensor::<BackendType, 1>::from_floats(image_chw.as_slice(), &device)
        .reshape([1, CHANNELS, height, width]);
    
    // Reshape kernel for depthwise convolution
    // Kernel data is [ky, kx, channel] = [(ky*3 + kx)*3 + c]
    // For depthwise: [out_channels=3, in_channels=1, kernel_h=3, kernel_w=3]
    // Each channel gets its own 3x3 kernel
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
    
    let kernel_tensor = Tensor::<BackendType, 1>::from_floats(kernel_reshaped.as_slice(), &device)
        .reshape([CHANNELS, 1, KERNEL_SIZE, KERNEL_SIZE]);
    
    // Apply conv2d with same padding (padding = 1 for 3x3 kernel with stride 1)
    // For depthwise convolution (each channel processed separately), use groups=CHANNELS
    use burn::tensor::module::conv2d;
    use burn::tensor::ops::ConvOptions;
    // ConvOptions::new(stride, padding, dilation, groups)
    // For same padding with 3x3 kernel and stride 1: padding = 1
    // groups=CHANNELS for depthwise convolution
    let options = ConvOptions::new([1, 1], [1, 1], [1, 1], CHANNELS);
    
    // conv2d takes (input, weight, bias, options) where bias can be None
    let output_tensor = conv2d(image_tensor, kernel_tensor, None, options);
    
    // Convert back to flat array [R, G, B, R, G, B, ...]
    let output_data = output_tensor.into_data();
    let output_slice = output_data.as_slice::<f32>().unwrap();
    
    // Convert from [batch, channels, height, width] back to [height, width, channels]
    let mut output = vec![0.0f32; height * width * CHANNELS];
    for y in 0..height {
        for x in 0..width {
            for c in 0..CHANNELS {
                let src_idx = c * height * width + y * width + x;
                let dst_idx = (y * width + x) * CHANNELS + c;
                output[dst_idx] = output_slice[src_idx];
            }
        }
    }
    
    output
}



