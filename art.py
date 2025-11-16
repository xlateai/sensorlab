import torch
import pygame
import numpy as np

SEED = 0

torch.manual_seed(SEED)
np.random.seed(SEED)

def run_convolution_artwork():
	# Parameters
	width, height = 512, 512
	channels = 3
	kernel_size = 7
	device = 'cpu'

	# Random convolution kernel
	conv = torch.nn.Conv2d(channels, channels, kernel_size, padding=kernel_size//2, bias=False)
	torch.nn.init.normal_(conv.weight, mean=0.0, std=0.5)
	conv = conv.to(device)

	# Start with light gray noise
	img = torch.rand(1, channels, height, width, device=device) * 0.5 + 0.25

	pygame.init()
	screen = pygame.display.set_mode((width, height))
	clock = pygame.time.Clock()

	running = True
	while running:
		for event in pygame.event.get():
			if event.type == pygame.QUIT:
				running = False

		# Apply convolution
		with torch.no_grad():
			img = conv(img)
			img = torch.clamp(img, 0, 1)

		# Convert to numpy and display
		arr = (img.squeeze().permute(1,2,0).cpu().numpy() * 255).astype(np.uint8)
		surf = pygame.surfarray.make_surface(arr)
		screen.blit(surf, (0,0))
		pygame.display.flip()
		clock.tick(30)

	pygame.quit()

run_convolution_artwork()