package app

import (
	"image"
	"image/color"
	"testing"

	"yingce/backend/internal/model"
)

func TestDownscaleImageKeepsAspectAndAverages(t *testing.T) {
	source := image.NewRGBA(image.Rect(0, 0, 2000, 1000))
	for y := 0; y < 1000; y++ {
		for x := 0; x < 2000; x++ {
			if x%2 == 0 {
				source.Set(x, y, color.RGBA{255, 255, 255, 255})
			} else {
				source.Set(x, y, color.RGBA{0, 0, 0, 255})
			}
		}
	}
	thumb := downscaleImage(source, 480)
	if thumb.Bounds().Dx() != 480 || thumb.Bounds().Dy() != 240 {
		t.Fatalf("size = %v", thumb.Bounds())
	}
	if r := thumb.RGBAAt(10, 10).R; r < 110 || r > 145 {
		t.Fatalf("expected averaged gray, got %d", r)
	}
	small := downscaleImage(image.NewRGBA(image.Rect(0, 0, 100, 50)), 480)
	if small.Bounds().Dx() != 100 {
		t.Fatalf("small image should not be upscaled: %v", small.Bounds())
	}
}

func TestResourceThumbnailSupported(t *testing.T) {
	ready := func(mime string, size int64) *model.Resource {
		return &model.Resource{Status: model.ResourceStatusReady, MimeType: mime, Size: size}
	}
	if !resourceThumbnailSupported(ready("image/jpeg", 1<<20)) || !resourceThumbnailSupported(ready("image/png", 1<<20)) {
		t.Fatal("jpeg and png should be supported")
	}
	if resourceThumbnailSupported(ready("image/gif", 1<<20)) || resourceThumbnailSupported(ready("video/mp4", 1<<20)) || resourceThumbnailSupported(ready("image/jpeg", resourceThumbnailMaxSource+1)) {
		t.Fatal("gif, video and oversized files must fall back to the original")
	}
}
