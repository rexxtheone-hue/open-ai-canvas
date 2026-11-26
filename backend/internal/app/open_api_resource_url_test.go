package app

import "testing"

func TestPublicResourceIDFromURL(t *testing.T) {
	cases := map[string]string{
		"https://omnimuse.io/api/public/resources/37b368b8263179ad21121e28220c12e3/file?expires=1&signature=x&variant=original": "37b368b8263179ad21121e28220c12e3",
		"https://agency.example.com/api/public/resources/abc/file":                                                              "abc",
		"https://omnimuse.io/api/public/resources/abc/preview":                                                                  "",
		"http://omnimuse.io/api/public/resources/abc/file":                                                                      "",
		"https://cdn.example.com/photo.jpg":                                                                                     "",
	}
	for raw, want := range cases {
		if got := publicResourceIDFromURL(raw); got != want {
			t.Errorf("%s: got %q, want %q", raw, got, want)
		}
	}
}
