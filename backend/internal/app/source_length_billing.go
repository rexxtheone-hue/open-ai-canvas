package app

import (
	"encoding/binary"
	"io"
	"math"
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

// applyRequestedAudioSeconds 让带时长选项的音频专项（文字生成音效）按所选时长预扣，结算时再按实测输出时长多退少补。
func applyRequestedAudioSeconds(input map[string]any) {
	metadata, _ := input["metadata"].(map[string]any)
	options, _ := metadata["specialtyOptions"].(map[string]any)
	config, _ := input["config"].(map[string]any)
	if config == nil || options == nil || normalizeCapability(stringValue(input["mode"])) != "audio" {
		return
	}
	seconds, err := strconv.ParseFloat(strings.TrimSpace(stringValue(options["duration"])), 64)
	if err != nil || seconds <= 0 || seconds > 600 {
		return
	}
	config["audioSeconds"] = strconv.FormatInt(int64(math.Ceil(seconds)), 10)
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

// probeWAVDurationMs 从 WAV 的 fmt / data 块读取时长，供没有 ffprobe 时按秒结算音频；不是 WAV 返回 0。读完把位置恢复原样。
func probeWAVDurationMs(file io.ReadSeeker) int64 {
	start, err := file.Seek(0, io.SeekCurrent)
	if err != nil {
		return 0
	}
	defer file.Seek(start, io.SeekStart)
	end, err := file.Seek(0, io.SeekEnd)
	if err != nil {
		return 0
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return 0
	}
	header := make([]byte, 12)
	if _, err := io.ReadFull(file, header); err != nil || string(header[:4]) != "RIFF" || string(header[8:12]) != "WAVE" {
		return 0
	}
	var byteRate uint64
	for offset := int64(12); offset+8 <= end; {
		chunk := make([]byte, 8)
		if _, err := io.ReadFull(file, chunk); err != nil {
			return 0
		}
		size := int64(binary.LittleEndian.Uint32(chunk[4:8]))
		body := offset + 8
		switch string(chunk[:4]) {
		case "fmt ":
			format := make([]byte, 12)
			if size < 12 {
				return 0
			}
			if _, err := io.ReadFull(file, format); err != nil {
				return 0
			}
			byteRate = uint64(binary.LittleEndian.Uint32(format[8:12]))
		case "data":
			if byteRate == 0 {
				return 0
			}
			if size == 0xFFFFFFFF || body+size > end {
				size = end - body
			}
			return int64((uint64(size)*1000 + byteRate - 1) / byteRate)
		}
		offset = body + size + size%2
		if _, err := file.Seek(offset, io.SeekStart); err != nil {
			return 0
		}
	}
	return 0
}

// probeAudioDurationMs 读取 WAV 或 MP3 时长；都不是时返回 0。
func probeAudioDurationMs(file io.ReadSeeker) int64 {
	if duration := probeWAVDurationMs(file); duration > 0 {
		return duration
	}
	return probeMP3DurationMs(file)
}

var (
	mp3Layer3Bitrates = [2][15]int64{
		{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320},
		{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160},
	}
	mp3SampleRates = [3]int64{44100, 48000, 32000}
)

// probeMP3DurationMs 逐帧累加 MPEG Layer III 的采样数，CBR 和 VBR 都准确；不是 MP3 返回 0。读完把位置恢复原样。
func probeMP3DurationMs(file io.ReadSeeker) int64 {
	start, err := file.Seek(0, io.SeekCurrent)
	if err != nil {
		return 0
	}
	defer file.Seek(start, io.SeekStart)
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return 0
	}
	data, err := io.ReadAll(io.LimitReader(file, 256<<20))
	if err != nil {
		return 0
	}
	offset := 0
	if len(data) >= 10 && string(data[:3]) == "ID3" {
		offset = 10 + (int(data[6])<<21 | int(data[7])<<14 | int(data[8])<<7 | int(data[9]))
		if data[5]&0x10 != 0 {
			offset += 10
		}
	}
	var micros, frames int64
	for offset+4 <= len(data) {
		header := data[offset : offset+4]
		version, layer := (header[1]>>3)&3, (header[1]>>1)&3
		bitrateIndex, rateIndex := header[2]>>4, (header[2]>>2)&3
		if header[0] != 0xFF || header[1]&0xE0 != 0xE0 || version == 1 || layer != 1 || bitrateIndex == 0 || bitrateIndex == 15 || rateIndex == 3 {
			offset++
			continue
		}
		table, samples, sampleRate := 0, int64(1152), mp3SampleRates[rateIndex]
		if version != 3 {
			table, samples = 1, 576
			sampleRate /= 2
			if version == 0 {
				sampleRate /= 2
			}
		}
		length := int(samples/8*mp3Layer3Bitrates[table][bitrateIndex]*1000/sampleRate) + int(header[2]>>1&1)
		if length < 4 {
			offset++
			continue
		}
		micros += samples * 1_000_000 / sampleRate
		frames++
		offset += length
	}
	if frames < 2 {
		return 0
	}
	return (micros + 999) / 1000
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
