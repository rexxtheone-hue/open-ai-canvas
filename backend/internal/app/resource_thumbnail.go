package app

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"
)

// 选择素材等网格只需要小图：按需把 JPEG/PNG 缩成长边 480px 的 JPEG 缓存在本地，
// 避免一次加载几十张几 MB 的原图。其他格式或生成失败时回退原图。
const (
	resourceThumbnailEdge      = 480
	resourceThumbnailMaxSource = 48 << 20
	resourceThumbnailMaxPixels = 64_000_000
)

var resourceThumbnailSlots = make(chan struct{}, 3)

func resourceThumbnailSupported(resource *model.Resource) bool {
	if resource == nil || resource.Status != model.ResourceStatusReady || resource.Size <= 0 || resource.Size > resourceThumbnailMaxSource {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(resource.MimeType)) {
	case "image/jpeg", "image/jpg", "image/png":
		return true
	}
	return false
}

func (s *Service) resourceThumbnailPath(resource *model.Resource) string {
	name := fmt.Sprintf("%s-%d-%d.jpg", resource.ID, resource.Size, resource.UpdatedAt.Unix())
	if filepath.Base(name) != name {
		return ""
	}
	return filepath.Join(s.dataDir, "thumbnails", name)
}

// openResourceThumbnail 返回缩略图流；不能生成时返回 nil，由调用方回退原图。
func (s *Service) openResourceThumbnail(userID string, resource *model.Resource) *ResourceStream {
	if !resourceThumbnailSupported(resource) {
		return nil
	}
	path := s.resourceThumbnailPath(resource)
	if path == "" {
		return nil
	}
	if stream := openThumbnailFile(resource, path); stream != nil {
		return stream
	}
	resourceThumbnailSlots <- struct{}{}
	defer func() { <-resourceThumbnailSlots }()
	if stream := openThumbnailFile(resource, path); stream != nil {
		return stream
	}
	if err := s.writeResourceThumbnail(userID, resource, path); err != nil {
		return nil
	}
	return openThumbnailFile(resource, path)
}

func openThumbnailFile(resource *model.Resource, path string) *ResourceStream {
	file, err := os.Open(path)
	if err != nil {
		return nil
	}
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
		file.Close()
		return nil
	}
	thumb := *resource
	thumb.MimeType = "image/jpeg"
	thumb.Size = info.Size()
	return &ResourceStream{Resource: &thumb, Body: file, StatusCode: http.StatusOK, ContentLength: info.Size(), AcceptRanges: "bytes"}
}

func (s *Service) writeResourceThumbnail(userID string, resource *model.Resource, path string) error {
	stream, err := s.openResourceRange(userID, resource, "")
	if err != nil {
		return err
	}
	defer stream.Body.Close()
	data, err := io.ReadAll(io.LimitReader(stream.Body, resourceThumbnailMaxSource+1))
	if err != nil {
		return err
	}
	if len(data) > resourceThumbnailMaxSource {
		return errors.New("原图过大")
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return err
	}
	if config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > resourceThumbnailMaxPixels {
		return errors.New("原图尺寸不支持缩略图")
	}
	source, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return err
	}
	thumb := downscaleImage(source, resourceThumbnailEdge)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(path), "thumb-*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	if err := jpeg.Encode(temp, thumb, &jpeg.Options{Quality: 82}); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(temp.Name(), path)
}

// downscaleImage 用区域平均把图片缩到长边不超过 edge；本来就小的图只转成 RGBA。
func downscaleImage(source image.Image, edge int) *image.RGBA {
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	rgba := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(rgba, rgba.Bounds(), image.NewUniform(image.White), image.Point{}, draw.Src)
	draw.Draw(rgba, rgba.Bounds(), source, bounds.Min, draw.Over)
	scale := float64(edge) / float64(max(width, height))
	if scale >= 1 {
		return rgba
	}
	targetW, targetH := max(1, int(float64(width)*scale+0.5)), max(1, int(float64(height)*scale+0.5))
	out := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	for y := 0; y < targetH; y++ {
		y0, y1 := y*height/targetH, max((y+1)*height/targetH, y*height/targetH+1)
		for x := 0; x < targetW; x++ {
			x0, x1 := x*width/targetW, max((x+1)*width/targetW, x*width/targetW+1)
			var r, g, b, count uint64
			for sy := y0; sy < y1; sy++ {
				row := rgba.Pix[sy*rgba.Stride+x0*4 : sy*rgba.Stride+x1*4]
				for i := 0; i < len(row); i += 4 {
					r += uint64(row[i])
					g += uint64(row[i+1])
					b += uint64(row[i+2])
					count++
				}
			}
			offset := y*out.Stride + x*4
			out.Pix[offset] = uint8(r / count)
			out.Pix[offset+1] = uint8(g / count)
			out.Pix[offset+2] = uint8(b / count)
			out.Pix[offset+3] = 255
		}
	}
	return out
}

func thumbnailResourceAccess(resource *model.Resource, access *ResourceAccess) *ResourceAccess {
	next := *access
	next.ResourceID = resource.ID
	next.ActualVariant = assets.VariantThumbnail
	next.Delivery = assets.DeliveryLocal
	next.FallbackReason = ""
	return &next
}
