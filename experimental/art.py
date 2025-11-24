import torch
import pygame
import numpy as np

SEED = 0

torch.manual_seed(SEED)
np.random.seed(SEED)

def run_convolution_artwork():
	# Parameters
	channels = 3
	kernel_size = 7
	device = 'cpu'

	def make_conv():
		conv = torch.nn.Conv2d(channels, channels, kernel_size, padding=kernel_size//2, bias=False)
		torch.nn.init.normal_(conv.weight, mean=0.0, std=0.5)
		return conv.to(device)

	conv = make_conv()

	pygame.init()
	info = pygame.display.Info()
	width, height = info.current_w, info.current_h
	screen = pygame.display.set_mode((width, height), pygame.RESIZABLE)
	clock = pygame.time.Clock()

	def make_img():
		return torch.rand(1, channels, height, width, device=device) * 0.5 + 0.25

	img = make_img()

	reinforce_lr = 0.0001  # learning rate for positive feedback
	penalize_lr = 0.001   # learning rate for negative feedback
	noise_std = 0.01      # noise for penalization

	# Feedback circle parameters
	circle_radius = 40

	# Reset button parameters
	reset_width, reset_height = 120, 40
	reset_rect = pygame.Rect((width // 2 - reset_width // 2, 10, reset_width, reset_height))
	reset_color = (200, 200, 255)
	reset_text_color = (0, 0, 80)
	font = pygame.font.SysFont(None, 32)

	running = True
	while running:
		for event in pygame.event.get():
			if event.type == pygame.QUIT:
				running = False
			elif event.type == pygame.VIDEORESIZE or (event.type == pygame.KEYDOWN and event.key == pygame.K_f):
				# Handle resizing or fullscreen toggle
				if event.type == pygame.VIDEORESIZE:
					new_width, new_height = event.w, event.h
				elif event.type == pygame.KEYDOWN and event.key == pygame.K_f:
					info = pygame.display.Info()
					new_width, new_height = info.current_w, info.current_h
				# Always resize image to fit window
				if new_width != width or new_height != height:
					# Resize image: crop or pad as needed
					def make_img_resize():
						new_img = torch.rand(1, channels, new_height, new_width, device=device) * 0.5 + 0.25
						copy_h = min(img.shape[-2], new_height)
						copy_w = min(img.shape[-1], new_width)
						new_img[..., :copy_h, :copy_w] = img[..., :copy_h, :copy_w]
						return new_img
					img = make_img_resize()
					width, height = new_width, new_height
					reset_rect = pygame.Rect((width // 2 - reset_width // 2, 10, reset_width, reset_height))
					screen = pygame.display.set_mode((width, height), pygame.RESIZABLE)
			elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
				if reset_rect.collidepoint(event.pos):
					conv = make_conv()
					img = make_img()

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
		# Ensure shape is (width, height, 3) for make_surface
		if arr.shape[0] != width or arr.shape[1] != height:
			arr = np.transpose(arr, (1, 0, 2))
		surf = pygame.surfarray.make_surface(arr)
		# Scale surface to window size in case of mismatch
		if surf.get_width() != width or surf.get_height() != height:
			surf = pygame.transform.scale(surf, (width, height))
		screen.blit(surf, (0,0))

		# Draw feedback circles
		pygame.draw.circle(screen, (0,255,0), green_center, circle_radius, 0)
		pygame.draw.circle(screen, (255,0,0), red_center, circle_radius, 0)

		# Draw reset button
		pygame.draw.rect(screen, reset_color, reset_rect, border_radius=10)
		reset_text = font.render("Reset", True, reset_text_color)
		text_rect = reset_text.get_rect(center=reset_rect.center)
		screen.blit(reset_text, text_rect)

		pygame.display.flip()
		clock.tick(30)

	pygame.quit()

run_convolution_artwork()