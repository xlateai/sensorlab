import numpy as np

NUM_SAMPLES = 16

def layer_sum():
    """Generate NUM_SAMPLES random numbers in [-1,1] and return their sum."""
    values = np.random.uniform(-1, 1, NUM_SAMPLES)
    return np.sum(values)

def compute(depth: int):
    """
    Compute a 'depth'-level nested sum.
    
    depth = 1 → sum of 16 random values
    depth = 2 → sum of 16 (depth-1) values
    depth = 3 → sum of 16 (depth-2) values
    ...
    """
    if depth < 1:
        raise ValueError("depth must be >= 1")
    
    # Base layer
    if depth == 1:
        return layer_sum()
    
    # Recursive composition
    return sum(compute(depth - 1) for _ in range(NUM_SAMPLES))

def main(depth=3):
    result = compute(depth)
    print(f"Depth {depth} result:", result)

if __name__ == "__main__":
    main(3)
