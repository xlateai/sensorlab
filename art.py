import torch
import pygame
import numpy as np

SEED = 0

torch.manual_seed(SEED)
np.random.seed(SEED)

def run_convolution_artwork():
	# Parameters
	initial_width, initial_height = 512, 512
	width, height = initial_width, initial_height
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
	screen = pygame.display.set_mode((width, height), pygame.RESIZABLE)
	clock = pygame.time.Clock()

	reinforce_lr = 0.0001  # learning rate for positive feedback
	penalize_lr = 0.001   # learning rate for negative feedback
	noise_std = 0.01      # noise for penalization

	# Feedback circle parameters
	circle_radius = 40

	running = True
	while running:
		for event in pygame.event.get():
			if event.type == pygame.QUIT:
				running = False
			elif event.type == pygame.VIDEORESIZE:
				# Handle resizing
				new_width, new_height = event.w, event.h
				# Crop or pad the image
				if new_width < img.shape[-1] or new_height < img.shape[-2]:
					# Crop
					img = img[..., :new_height, :new_width]
				else:
					# Pad with new random noise
					pad_img = torch.rand(1, channels, new_height, new_width, device=device) * 0.5 + 0.25
					pad_img[..., :img.shape[-2], :img.shape[-1]] = img
					img = pad_img
				width, height = new_width, new_height
				screen = pygame.display.set_mode((width, height), pygame.RESIZABLE)

		mouse_x, mouse_y = pygame.mouse.get_pos()

		# Feedback circle positions
		green_center = (width - circle_radius - 10, circle_radius + 10)
		red_center = (circle_radius + 10, circle_radius + 10)

		# Check feedback region
		def in_circle(center):
			dx = mouse_x - center[0]
			dy = mouse_y - center[1]
			return dx*dx + dy*dy <= circle_radius*circle_radius

		mouse_in_green = in_circle(green_center)
		mouse_in_red = in_circle(red_center)

		# Apply convolution
		with torch.no_grad():
			img = conv(img)
			img = torch.clamp(img, 0, 1)

		# Interactive kernel tuning
		with torch.no_grad():
			if mouse_in_green:
				img_mean = img.mean(dim=(0, 2, 3))  # shape: (channels,)
				for out_ch in range(conv.weight.shape[0]):
					for in_ch in range(conv.weight.shape[1]):
						conv.weight[out_ch, in_ch, :, :] += reinforce_lr * img_mean[in_ch].item()
			elif mouse_in_red:
				conv.weight.add_(torch.randn_like(conv.weight) * noise_std)

		# Convert to numpy and display
		arr = (img.squeeze().permute(1,2,0).cpu().numpy() * 255).astype(np.uint8)
		surf = pygame.surfarray.make_surface(arr)
		screen.blit(surf, (0,0))

		# Draw feedback circles
		pygame.draw.circle(screen, (0,255,0), green_center, circle_radius, 0)
		pygame.draw.circle(screen, (255,0,0), red_center, circle_radius, 0)

		pygame.display.flip()
		clock.tick(30)

	pygame.quit()

run_convolution_artwork()