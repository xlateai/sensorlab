import torch

def run_convolution_artwork():
	import pygame
	import numpy as np
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

# To run: call run_convolution_artwork() from main or REPL
# Pygame procedural artwork: glassy neon sinusoids with smooth transitions
import pygame
import math
import random

def neon_color(t, phase=0):
	# Cycle through vibrant neon colors
	r = int(128 + 127 * math.sin(t + phase))
	g = int(128 + 127 * math.sin(t + phase + 2))
	b = int(128 + 127 * math.sin(t + phase + 4))
	return (r, g, b)

def draw_glow(surface, x, y, color, radius, intensity=4):
	# Softer, subtler glow: less center brightness, clearer wave
	for i in range(intensity, 0, -1):
		layer_radius = int(radius * (1 + i / intensity * 1.2))
		# Lower alpha for outer layers, less overall brightness
		alpha = int(80 * (i / intensity) ** 1.5)
		glow_surf = pygame.Surface((layer_radius*2, layer_radius*2), pygame.SRCALPHA)
		pygame.draw.circle(glow_surf, color + (alpha,), (layer_radius, layer_radius), layer_radius)
		surface.blit(glow_surf, (x-layer_radius, y-layer_radius), special_flags=pygame.BLEND_ADD)
	# Subtle core highlight (much less bright)
	core_surf = pygame.Surface((radius, radius), pygame.SRCALPHA)
	pygame.draw.circle(core_surf, color + (60,), (radius//2, radius//2), radius//2)
	surface.blit(core_surf, (x-radius//2, y-radius//2), special_flags=pygame.BLEND_ADD)

def run_neon_sinusoids_artwork():
	pygame.init()
	width, height = 900, 600
	screen = pygame.display.set_mode((width, height))
	clock = pygame.time.Clock()

	# Parameters for multiple sinusoids
	waves = [
		{
			'amplitude': random.uniform(40, 120),
			'frequency': random.uniform(0.005, 0.02),
			'phase': random.uniform(0, math.pi*2),
			'speed': random.uniform(0.5, 1.5),
			'color_phase': random.uniform(0, math.pi*2),
		}
		for _ in range(5)
	]

	t = 0
	running = True
	while running:
		for event in pygame.event.get():
			if event.type == pygame.QUIT:
				running = False

		screen.fill((10, 10, 20))  # dark background

		for wave in waves:
			points = []
			for x in range(0, width, 6):
				y = int(height/2 + wave['amplitude'] * math.sin(wave['frequency'] * x + t * wave['speed'] + wave['phase']))
				points.append((x, y))
			color = neon_color(t, wave['color_phase'])
			# Draw glow along the wave
			for x, y in points:
				draw_glow(screen, x, y, color, radius=16, intensity=6)
			# Draw the main wave line
			pygame.draw.lines(screen, color, False, points, 2)

		pygame.display.flip()
		t += 0.02
		clock.tick(60)

	pygame.quit()

# To run: call run_neon_sinusoids_artwork() from main or REPL
run_convolution_artwork()