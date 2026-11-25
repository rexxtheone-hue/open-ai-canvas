package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"text/tabwriter"
	"time"
)

var assetIDPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

var editOperations = map[string]string{
	"edit": "inpaint", "inpaint": "inpaint", "replace": "replace_element", "replace_element": "replace_element",
	"style": "style_transfer", "style_transfer": "style_transfer", "camera": "camera_motion", "camera_motion": "camera_motion",
	"extend": "extend", "lipsync": "lip_sync", "lip_sync": "lip_sync", "motion": "motion_transfer", "motion_transfer": "motion_transfer",
}

// 对口型、动作迁移、续写不一定需要文字说明，没写提示词时用默认说明。
var defaultEditPrompts = map[string]string{
	"lip_sync":        "Make the person speak the audio with natural lip movement.",
	"motion_transfer": "Make the character perform the motion from the reference video.",
	"extend":          "Continue the video naturally.",
}

func cmdAssets(c *client, args []string) error {
	fs := flag.NewFlagSet("assets", flag.ContinueOnError)
	query := fs.String("q", "", "name to search")
	limit := fs.Int("n", 30, "how many")
	asJSON := fs.Bool("json", false, "print JSON")
	positional, err := parseInterspersed(fs, args)
	if err != nil {
		return err
	}
	values := url.Values{"limit": {strconv.Itoa(*limit)}}
	if len(positional) > 0 {
		values.Set("kind", positional[0])
	}
	if *query != "" {
		values.Set("query", *query)
	}
	var page struct {
		Assets []struct {
			ID                string    `json:"id"`
			Kind              string    `json:"kind"`
			Name              string    `json:"name"`
			Character         string    `json:"character"`
			Width             int       `json:"width"`
			Height            int       `json:"height"`
			DurationMs        int64     `json:"durationMs"`
			CreatedAt         time.Time `json:"createdAt"`
			SameNameCount     int       `json:"sameNameCount"`
			SameNameIdentical bool      `json:"sameNameIdentical"`
		} `json:"assets"`
	}
	if err := c.getJSON("/v1/assets?"+values.Encode(), &page); err != nil {
		return err
	}
	if *asJSON {
		return printJSON(page.Assets)
	}
	if len(page.Assets) == 0 {
		fmt.Println("No matching assets. Upload files in OmniMuse Studio, or pass a local file with -i.")
		return nil
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "ID\tKIND\tNAME\tSIZE\tADDED")
	duplicates := false
	for _, a := range page.Assets {
		size := ""
		if a.Width > 0 {
			size = fmt.Sprintf("%dx%d", a.Width, a.Height)
		}
		if a.DurationMs > 0 {
			size = strings.TrimSpace(size + fmt.Sprintf(" %.1fs", float64(a.DurationMs)/1000))
		}
		name := firstNonEmpty(a.Character, a.Name)
		if a.SameNameCount > 1 && !a.SameNameIdentical {
			name += " *"
			duplicates = true
		}
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", a.ID, a.Kind, name, size, a.CreatedAt.Local().Format("2006-01-02 15:04"))
	}
	if err := w.Flush(); err != nil {
		return err
	}
	if duplicates {
		fmt.Println("* Several different files share this name; check the size and date before using one.")
	}
	return nil
}

func cmdEdit(c *client, args []string) error {
	if len(args) < 2 {
		return errors.New(`usage: omnimuse edit <edit|replace|style|camera|extend|lipsync|motion> <source> "<prompt>" [flags]`)
	}
	operation, ok := editOperations[strings.ToLower(args[0])]
	if !ok {
		return fmt.Errorf("unknown edit operation %q. Use: edit, replace, style, camera, extend, lipsync or motion", args[0])
	}
	// 原素材放在第一位：服务端按素材先后区分原视频和参考素材。
	return cmdGenerate(c, "video", append([]string{"--op", operation, "-i", args[1]}, args[2:]...))
}

type batchRow struct {
	Line int
	Kind string
	Req  generationRequest
}

func cmdBatch(c *client, args []string) error {
	fs := flag.NewFlagSet("batch", flag.ContinueOnError)
	outDir := fs.String("o", ".", "download folder")
	yes := fs.Bool("y", false, "skip confirmation")
	fs.BoolVar(yes, "yes", false, "skip confirmation")
	noDownload := fs.Bool("no-download", false, "do not download")
	asJSON := fs.Bool("json", false, "print JSON")
	positional, err := parseInterspersed(fs, args)
	if err != nil {
		return err
	}
	if len(positional) != 1 {
		return errors.New("usage: omnimuse batch <file.csv|file.jsonl> [-o dir] [-y]")
	}
	rows, err := readBatchFile(positional[0])
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return errors.New("the batch file has no rows")
	}
	if len(rows) > 100 {
		return errors.New("a batch can have at most 100 rows; split the file")
	}
	baseDir := filepath.Dir(positional[0])
	defaults := map[string]string{}
	resolved := map[string]reference{}
	resolve := func(value, kind, role string) (reference, error) {
		value = strings.TrimSpace(value)
		// 相对路径按批量文件所在的文件夹找，这样文件和素材可以放在一起。
		if !strings.Contains(value, "://") && !filepath.IsAbs(value) {
			if _, err := os.Stat(filepath.Join(baseDir, value)); err == nil {
				value = filepath.Join(baseDir, value)
			}
		}
		key := value + "\x00" + kind + "\x00" + role
		if ref, ok := resolved[key]; ok {
			return ref, nil
		}
		ref, err := c.resolveReference(value, kind, role)
		if err == nil {
			resolved[key] = ref
		}
		return ref, err
	}
	total := 0.0
	for i := range rows {
		row := &rows[i]
		if row.Req.Model == "" {
			if defaults[row.Kind] == "" {
				var models struct {
					Models []modelInfo `json:"models"`
				}
				if err := c.getJSON("/v1/models?kind="+row.Kind, &models); err != nil {
					return err
				}
				if len(models.Models) == 0 {
					return fmt.Errorf("no %s models are available", row.Kind)
				}
				defaults[row.Kind] = models.Models[0].ID
			}
			row.Req.Model = defaults[row.Kind]
		}
		for j, ref := range row.Req.References {
			next, err := resolve(ref.URL, ref.Kind, ref.Role)
			if err != nil {
				return fmt.Errorf("row %d: %w", row.Line, err)
			}
			row.Req.References[j] = next
		}
		var quote struct {
			Credits float64 `json:"credits"`
		}
		if err := c.postJSON("/v1/quote", row.Req, &quote); err != nil {
			return fmt.Errorf("row %d: %w", row.Line, err)
		}
		total += quote.Credits
	}
	if !*asJSON {
		fmt.Fprintf(os.Stderr, "%d rows, %s credits in total.\n", len(rows), formatCredits(total))
	}
	if !*yes && !*asJSON && isTerminal() {
		fmt.Fprint(os.Stderr, "Start all of them? [Y/n] ")
		var answer string
		_, _ = fmt.Scanln(&answer)
		if answer = strings.ToLower(strings.TrimSpace(answer)); answer != "" && answer != "y" && answer != "yes" {
			return errors.New("cancelled")
		}
	}
	type submittedRow struct {
		line int
		id   string
	}
	submitted := []submittedRow{}
	var submitErr error
	for _, row := range rows {
		var res struct {
			Generations []generation `json:"generations"`
		}
		if err := c.postJSON("/v1/generations", row.Req, &res); err != nil {
			submitErr = fmt.Errorf("row %d: %w (the rows before it were submitted)", row.Line, err)
			break
		}
		for _, g := range res.Generations {
			submitted = append(submitted, submittedRow{row.Line, g.ID})
		}
	}
	if !*asJSON {
		fmt.Fprintf(os.Stderr, "Submitted %d generations. Waiting for results...\n", len(submitted))
	}
	results := make([]generation, 0, len(submitted))
	failures := 0
	for _, item := range submitted {
		done, err := c.waitFor(item.id, false)
		if err != nil {
			return err
		}
		if done.Status == "succeeded" && !*noDownload {
			if err := c.downloadOutputs(done, *outDir, false); err != nil {
				return err
			}
		}
		if done.Status != "succeeded" {
			failures++
		}
		if !*asJSON {
			detail := strings.Join(done.Files, ", ")
			if done.Status != "succeeded" {
				detail = done.Error
			}
			fmt.Printf("row %-3d %s  %-9s %s\n", item.line, done.ID[:min(8, len(done.ID))], done.Status, detail)
		}
		results = append(results, *done)
	}
	if *asJSON {
		if err := printJSON(results); err != nil {
			return err
		}
	}
	if submitErr != nil {
		return submitErr
	}
	if failures > 0 {
		return fmt.Errorf("%d of %d generations failed (their credits are refunded automatically)", failures, len(results))
	}
	return nil
}

// readBatchFile 读 CSV（第一行是列名，可以用 Excel 编辑）或 JSONL（每行一个 JSON 对象）。
func readBatchFile(path string) ([]batchRow, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	records := []map[string]any{}
	lines := []int{}
	if strings.EqualFold(filepath.Ext(path), ".csv") {
		reader := csv.NewReader(bytes.NewReader(data))
		reader.FieldsPerRecord = -1
		all, err := reader.ReadAll()
		if err != nil {
			return nil, err
		}
		if len(all) < 2 {
			return nil, nil
		}
		header := all[0]
		for i, record := range all[1:] {
			item := map[string]any{}
			for j, value := range record {
				if j < len(header) && strings.TrimSpace(value) != "" {
					item[strings.ToLower(strings.TrimSpace(header[j]))] = strings.TrimSpace(value)
				}
			}
			if len(item) > 0 {
				records, lines = append(records, item), append(lines, i+2)
			}
		}
	} else {
		for i, line := range strings.Split(string(data), "\n") {
			if line = strings.TrimSpace(line); line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			item := map[string]any{}
			if err := json.Unmarshal([]byte(line), &item); err != nil {
				return nil, fmt.Errorf("line %d: %w", i+1, err)
			}
			lowered := map[string]any{}
			for key, value := range item {
				lowered[strings.ToLower(key)] = value
			}
			records, lines = append(records, lowered), append(lines, i+1)
		}
	}
	rows := make([]batchRow, 0, len(records))
	for i, item := range records {
		row, err := batchRowFrom(item, lines[i])
		if err != nil {
			return nil, err
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func batchRowFrom(item map[string]any, line int) (batchRow, error) {
	text := func(keys ...string) string {
		for _, key := range keys {
			if value, ok := item[key]; ok && value != nil {
				return strings.TrimSpace(fmt.Sprint(value))
			}
		}
		return ""
	}
	row := batchRow{Line: line, Kind: strings.ToLower(text("kind", "type"))}
	if row.Kind == "" {
		row.Kind = "image"
	}
	if row.Kind != "image" && row.Kind != "video" {
		return row, fmt.Errorf("row %d: kind must be image or video", line)
	}
	req := generationRequest{Model: text("model"), Prompt: text("prompt"), AspectRatio: text("ratio", "aspect_ratio", "aspectratio"), Resolution: text("res", "resolution"), Quality: text("quality")}
	if op := text("op", "operation"); op != "" {
		if mapped, ok := editOperations[strings.ToLower(op)]; ok {
			op = mapped
		}
		req.Operation = op
	}
	if req.Prompt == "" {
		req.Prompt = defaultEditPrompts[req.Operation]
	}
	if req.Prompt == "" {
		return row, fmt.Errorf("row %d: prompt is empty", line)
	}
	var err error
	if value := text("duration"); value != "" {
		if req.Duration, err = strconv.Atoi(strings.TrimSuffix(value, "s")); err != nil {
			return row, fmt.Errorf("row %d: duration must be a number of seconds", line)
		}
	}
	if value := text("count", "n"); value != "" {
		if req.Count, err = strconv.Atoi(value); err != nil {
			return row, fmt.Errorf("row %d: count must be a number", line)
		}
	}
	if value := strings.ToLower(text("audio")); value != "" {
		on := value == "true" || value == "yes" || value == "1" || value == "on"
		req.GenerateAudio = &on
	}
	if value := text("first"); value != "" {
		req.References = append(req.References, reference{URL: value, Kind: "image", Role: "first_frame"})
	}
	if value := text("last"); value != "" {
		req.References = append(req.References, reference{URL: value, Kind: "image", Role: "last_frame"})
	}
	var refs []string
	for _, key := range []string{"ref", "refs"} {
		switch value := item[key].(type) {
		case nil:
		case []any:
			for _, v := range value {
				refs = append(refs, fmt.Sprint(v))
			}
		default:
			refs = append(refs, strings.Split(fmt.Sprint(value), "|")...)
		}
	}
	for _, ref := range refs {
		if ref = strings.TrimSpace(ref); ref != "" {
			req.References = append(req.References, reference{URL: ref})
		}
	}
	row.Req = req
	return row, nil
}
