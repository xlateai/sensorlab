/// Apply 3D convolution to an RGB image
/// 
/// # Arguments
/// * `image_data` - Flat array of RGB values: [R, G, B, R, G, B, ...] for 128x128 image (49152 values)
/// * `kernel_data` - 3x3x3 kernel as flat array (27 values)
/// 
/// # Returns
/// Flat array of convolved RGB values (49152 values)
pub fn apply_convolution(image_data: &[f32], kernel_data: &[f32]) -> Vec<f32> {
    const WIDTH: usize = 128;
    const HEIGHT: usize = 128;
    const CHANNELS: usize = 3;
    const KERNEL_SIZE: usize = 3;
    
    // Create output tensor
    let mut output = vec![0.0f32; HEIGHT * WIDTH * CHANNELS];
    
    // Apply convolution with zero padding
    for y in 0..HEIGHT {
        for x in 0..WIDTH {
            for c in 0..CHANNELS {
                let mut sum = 0.0;
                
                for ky in 0..KERNEL_SIZE {
                    for kx in 0..KERNEL_SIZE {
                        let py = y as i32 + ky as i32 - 1;
                        let px = x as i32 + kx as i32 - 1;
                        
                        // Zero padding: if out of bounds, use 0
                        if py >= 0 && py < HEIGHT as i32 && px >= 0 && px < WIDTH as i32 {
                            let idx = (py as usize * WIDTH + px as usize) * CHANNELS + c;
                            let pixel_val = image_data[idx];
                            let kernel_val = kernel_data[(ky * KERNEL_SIZE + kx) * CHANNELS + c];
                            sum += pixel_val * kernel_val;
                        }
                    }
                }
                
                let out_idx = (y * WIDTH + x) * CHANNELS + c;
                output[out_idx] = sum;
            }
        }
    }
    
    output
}

