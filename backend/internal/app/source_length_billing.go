package app

import (
	"encoding/binary"
	"io"
	"strconv"
	"strings"
)

// 输出与原视频等长的专项操作：按原视频时长计费，时长取服务器入库时测得的资源时长，不信任请求里的 videoSeconds。
var sourceLengthVideoOperations = map[string]bool{"video_upscale": true, "video_sfx": true, "dubbing": true}

func (s *Service) applySourceLengthVideoSeconds(userID string, input map[string]any, operation string) error {
	metadata, _ := input["metadata"].(map[string]any)
	operation = firstNonEmpty(metadataString(metadata, "videoEditOperation"), strings.TrimSpace(operation))
	if !sourceLengthVideoOperations[operation] || normalizeCapability(stringValue(input["mode"])) != "video" {
		return nil
	}
	config, _ := input["config"].(map[string]any)
	references, _ := input["referenceVideos"].([]any)
	if config == nil || len(references) == 0 {
		return nil
	}
	media, _ := references[0].(map[string]any)
	if key := stringValue(media["storageKey"]); strings.HasPrefix(key, "resource:") {
		resource, err := s.repo.ResourceForUser(userID, strings.TrimPrefix(key, "resource:"))
		if err != nil {
			return err
		}
		if resource.DurationMs > 0 {
			media["durationMs"] = resource.DurationMs
			config["videoSeconds"] = strconv.FormatInt((resource.DurationMs+999)/1000, 10)
			return nil
		}
	}
	// 时长未知（旧资源、外部链接）时与参考视频附加费一致，至少按 15 秒计。
	if billingQuantity("video", config["videoSeconds"]) < 15 {
		config["videoSeconds"] = "15"
	}
	return nil
}

// probeVideoDurationMs 从 MP4 / MOV 的 moov/mvhd 读取时长；不是这类文件或读取失败返回 0。读完把位置恢复原样。
func probeVideoDurationMs(file io.ReadSeeker) int64 {
	start, err := file.Seek(0, io.SeekCurrent)
	if err != nil {
		return 0
	}
	defer file.Seek(start, io.SeekStart)
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return 0
	}
	end, err := file.Seek(0, io.SeekEnd)
	if err != nil {
		return 0
	}
	moov, moovEnd, ok := findMP4Box(file, 0, end, "moov")
	if !ok {
		return 0
	}
	mvhd, _, ok := findMP4Box(file, moov, moovEnd, "mvhd")
	if !ok {
		return 0
	}
	if _, err := file.Seek(mvhd, io.SeekStart); err != nil {
		return 0
	}
	header := make([]byte, 32)
	if _, err := io.ReadFull(file, header[:4]); err != nil {
		return 0
	}
	var timescale, duration uint64
	if header[0] == 1 {
		if _, err := io.ReadFull(file, header[:28]); err != nil {
			return 0
		}
		timescale, duration = uint64(binary.BigEndian.Uint32(header[16:20])), binary.BigEndian.Uint64(header[20:28])
	} else {
		if _, err := io.ReadFull(file, header[:16]); err != nil {
			return 0
		}
		timescale, duration = uint64(binary.BigEndian.Uint32(header[8:12])), uint64(binary.BigEndian.Uint32(header[12:16]))
	}
	if timescale == 0 || duration == 0 || duration == 0xFFFFFFFF || duration == 0xFFFFFFFFFFFFFFFF || duration/timescale > 24*3600 {
		return 0
	}
	return int64((duration*1000 + timescale - 1) / timescale)
}

// findMP4Box 在 [from, to) 内找同级的盒子，返回盒子内容的起止位置。
func findMP4Box(file io.ReadSeeker, from, to int64, name string) (int64, int64, bool) {
	header := make([]byte, 16)
	for offset := from; offset+8 <= to; {
		if _, err := file.Seek(offset, io.SeekStart); err != nil {
			return 0, 0, false
		}
		if _, err := io.ReadFull(file, header[:8]); err != nil {
			return 0, 0, false
		}
		size, headerSize := int64(binary.BigEndian.Uint32(header[:4])), int64(8)
		switch size {
		case 0:
			size = to - offset
		case 1:
			if _, err := io.ReadFull(file, header[8:16]); err != nil {
				return 0, 0, false
			}
			size, headerSize = int64(binary.BigEndian.Uint64(header[8:16])), 16
		}
		if size < headerSize || offset+size > to {
			return 0, 0, false
		}
		if string(header[4:8]) == name {
			return offset + headerSize, offset + size, true
		}
		offset += size
	}
	return 0, 0, false
}
