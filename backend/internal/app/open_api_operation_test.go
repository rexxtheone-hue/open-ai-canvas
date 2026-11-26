package app

import "testing"

func TestOpenAPIVideoOperationReferenceRole(t *testing.T) {
	model := &OpenAPIModel{Operations: []string{"text_to_video", "image_to_video", "reference_to_video"}}
	image := func(role string) any { return map[string]any{"role": role} }
	cases := []struct {
		name   string
		images []any
		want   string
	}{
		{"two references stay references", []any{image("reference"), image("reference")}, "reference_to_video"},
		{"one reference stays reference", []any{image("reference")}, "reference_to_video"},
		{"two unlabelled images are frames", []any{image(""), image("")}, "image_to_video"},
		{"explicit first frame wins", []any{image("first_frame"), image("reference")}, "image_to_video"},
	}
	for _, tc := range cases {
		if got := openAPIVideoOperation(model, map[string][]any{"image": tc.images}); got != tc.want {
			t.Errorf("%s: got %s, want %s", tc.name, got, tc.want)
		}
	}
	imageOnly := &OpenAPIModel{Operations: []string{"image_to_video"}}
	if got := openAPIVideoOperation(imageOnly, map[string][]any{"image": {image("reference")}}); got != "image_to_video" {
		t.Errorf("model without reference_to_video: got %s", got)
	}
}
