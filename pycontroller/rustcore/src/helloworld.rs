use burn::{
    module::Module,
    nn,
    optim::{Optimizer, GradientsParams},
    tensor::{backend::Backend, Tensor},
};

use burn_ndarray::NdArray;
use burn_autodiff::Autodiff;

// Simple linear model: y = Wx + b
#[derive(Module, Debug)]
pub struct LinearModel<B: Backend> {
    linear: nn::Linear<B>,
}

impl<B: Backend> LinearModel<B> {
    pub fn new(device: &B::Device) -> Self {
        Self {
            linear: nn::LinearConfig::new(1, 1).init(device),
        }
    }

    pub fn forward(&self, x: Tensor<B, 2>) -> Tensor<B, 2> {
        self.linear.forward(x)
    }
}

/// Run ML training and return output as a string
pub fn run_training() -> String {
    let mut output = String::new();
    
    output.push_str("🔥 Burn-rs Hello World!\n");
    output.push_str("Training a simple linear model to learn y = 2x + 1\n\n");

    // Use Autodiff wrapper for automatic differentiation during training
    type Backend = Autodiff<NdArray<f32>>;
    let device = Default::default();
    
    // Create model
    let model = LinearModel::<Backend>::new(&device);
    
    // Create optimizer
    let mut optim = burn::optim::AdamConfig::new().init();
    
    // Create simple training data: y = 2x + 1
    // Input: x values from 0 to 10
    // Output: y = 2x + 1
    let x_train: Vec<f32> = (0..=10).map(|i| i as f32).collect();
    let y_train: Vec<f32> = x_train.iter().map(|&x| 2.0 * x + 1.0).collect();
    
    output.push_str("Training data:\n");
    for (x, y) in x_train.iter().zip(y_train.iter()) {
        output.push_str(&format!("  x={:.1}, y={:.1} (target: y = 2x + 1)\n", x, y));
    }
    output.push_str("\n");

    // Convert to tensors - create 2D tensors with shape (batch_size, 1)
    let batch_size = x_train.len();
    
    // Create tensors from 1D data and reshape to [batch_size, 1]
    let x_tensor = Tensor::<Backend, 1>::from_floats(
        x_train.as_slice(),
        &device,
    ).reshape([batch_size, 1]);
    
    let y_tensor = Tensor::<Backend, 1>::from_floats(
        y_train.as_slice(),
        &device,
    ).reshape([batch_size, 1]);

    // Training loop
    let num_epochs = 100;
    output.push_str(&format!("Training for {} epochs...\n\n", num_epochs));

    let mut model = model;

    for epoch in 0..num_epochs {
        // Forward pass
        let y_pred = model.forward(x_tensor.clone());
        
        // Compute loss (mean squared error)
        // Use powf_scalar for scalar exponent
        let loss = (y_pred - y_tensor.clone()).powf_scalar(2.0).mean();
        
        // Backward pass and update
        let grads = loss.backward();
        let grads_params = GradientsParams::from_grads(grads, &model);
        let learning_rate = 0.01;
        model = optim.step(learning_rate, model, grads_params);
        
        // Print progress every 10 epochs
        if epoch % 10 == 0 || epoch == num_epochs - 1 {
            let loss_value = loss.clone().into_scalar();
            output.push_str(&format!("Epoch {}: Loss = {:.6}\n", epoch, loss_value));
        }
    }

    output.push_str("\n✅ Training complete!\n\n");
    
    // Test the model - convert to inference backend (no autodiff needed)
    output.push_str("Testing the model:\n");
    let test_x: Vec<f32> = vec![3.0, 5.0, 7.0];
    let test_batch_size = test_x.len();
    
    // For inference, we can use the model directly (Autodiff backend works for inference too)
    let test_x_tensor = Tensor::<Backend, 1>::from_floats(
        test_x.as_slice(),
        &device,
    ).reshape([test_batch_size, 1]);
    
    let predictions = model.forward(test_x_tensor);
    
    // Extract values from tensor by converting to data and accessing elements
    let pred_data = predictions.into_data();
    let pred_values: Vec<f32> = pred_data.as_slice::<f32>().unwrap().to_vec();
    
    for (x, pred) in test_x.iter().zip(pred_values.iter()) {
        let expected = 2.0 * x + 1.0;
        output.push_str(&format!("  x={:.1}: predicted y={:.3}, expected y={:.1}, error={:.3}\n", 
                 x, pred, expected, (pred - expected).abs()));
    }
    
    output.push_str("\n🎉 Done! The model learned to approximate y = 2x + 1\n");
    
    output
}



