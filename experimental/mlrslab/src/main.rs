use burn::{
    module::Module,
    nn,
    tensor::{backend::Backend, Tensor},
    train::{GradientsParams, LearnerBuilder, TrainOutput, TrainStep, ValidStep},
};

use burn_ndarray::NdArrayBackend;

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

fn main() {
    println!("🔥 Burn-rs Hello World!");
    println!("Training a simple linear model to learn y = 2x + 1\n");

    // Use CPU device
    let device = Default::default();
    
    // Create model
    let model = LinearModel::<NdArrayBackend<f32>>::new(&device);
    
    // Create optimizer
    let optim = burn::optim::AdamConfig::new().init();
    
    // Create simple training data: y = 2x + 1
    // Input: x values from 0 to 10
    // Output: y = 2x + 1
    let x_train: Vec<f32> = (0..=10).map(|i| i as f32).collect();
    let y_train: Vec<f32> = x_train.iter().map(|&x| 2.0 * x + 1.0).collect();
    
    println!("Training data:");
    for (x, y) in x_train.iter().zip(y_train.iter()) {
        println!("  x={:.1}, y={:.1} (target: y = 2x + 1)", x, y);
    }
    println!();

    // Convert to tensors
    let x_tensor = Tensor::from_floats(
        x_train.iter().map(|&x| vec![x]).collect::<Vec<_>>(),
        &device,
    );
    let y_tensor = Tensor::from_floats(
        y_train.iter().map(|&y| vec![y]).collect::<Vec<_>>(),
        &device,
    );

    // Training loop
    let num_epochs = 100;
    println!("Training for {} epochs...\n", num_epochs);

    let mut model = model;
    let mut optim = optim;

    for epoch in 0..num_epochs {
        // Forward pass
        let y_pred = model.forward(x_tensor.clone());
        
        // Compute loss (mean squared error)
        let loss = (y_pred - y_tensor.clone()).powf(2.0).mean();
        
        // Backward pass and update
        let grads = loss.backward();
        model = optim.step(model, grads);
        
        // Print progress every 10 epochs
        if epoch % 10 == 0 || epoch == num_epochs - 1 {
            let loss_value = loss.clone().into_scalar();
            println!("Epoch {}: Loss = {:.6}", epoch, loss_value);
        }
    }

    println!("\n✅ Training complete!\n");
    
    // Test the model
    println!("Testing the model:");
    let test_x: Vec<f32> = vec![3.0, 5.0, 7.0];
    let test_x_tensor = Tensor::from_floats(
        test_x.iter().map(|&x| vec![x]).collect::<Vec<_>>(),
        &device,
    );
    
    let predictions = model.forward(test_x_tensor);
    let pred_values: Vec<f32> = predictions.into_data().value.iter().map(|v| v[0]).collect();
    
    for (x, pred) in test_x.iter().zip(pred_values.iter()) {
        let expected = 2.0 * x + 1.0;
        println!("  x={:.1}: predicted y={:.3}, expected y={:.1}, error={:.3}", 
                 x, pred, expected, (pred - expected).abs());
    }
    
    println!("\n🎉 Done! The model learned to approximate y = 2x + 1");
}
