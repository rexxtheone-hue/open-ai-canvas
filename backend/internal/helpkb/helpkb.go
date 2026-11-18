// Package helpkb 是帮助助手的知识库：Studio 功能、步骤和常见问题，以中文写成，助手按用户语言作答。
package helpkb

import (
	"embed"
	"sort"
	"strings"
)

//go:embed articles/*.md
var files embed.FS

type Article struct {
	ID    string
	Title string
	Pages []string
	Body  string
}

var articles = load()

func load() []Article {
	entries, err := files.ReadDir("articles")
	if err != nil {
		panic(err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	sort.Strings(names)
	out := make([]Article, 0, len(names))
	for _, name := range names {
		raw, err := files.ReadFile("articles/" + name)
		if err != nil {
			panic(err)
		}
		out = append(out, parse(strings.ReplaceAll(string(raw), "\r\n", "\n")))
	}
	return out
}

func parse(text string) Article {
	var article Article
	if rest, ok := strings.CutPrefix(text, "---\n"); ok {
		if head, body, found := strings.Cut(rest, "\n---\n"); found {
			for _, line := range strings.Split(head, "\n") {
				key, value, _ := strings.Cut(line, ":")
				value = strings.TrimSpace(value)
				switch strings.TrimSpace(key) {
				case "id":
					article.ID = value
				case "title":
					article.Title = value
				case "pages":
					article.Pages = strings.Fields(value)
				}
			}
			text = body
		}
	}
	article.Body = strings.TrimSpace(text)
	return article
}

func Articles() []Article {
	return articles
}

// Document 把全部文章拼成一份放进系统提示词；文章少时整份放入比检索更稳，且能命中提示词缓存。
func Document() string {
	var b strings.Builder
	for _, article := range articles {
		b.WriteString("<article id=\"")
		b.WriteString(article.ID)
		b.WriteString("\">\n")
		b.WriteString(article.Body)
		b.WriteString("\n</article>\n\n")
	}
	return b.String()
}

// ForPage 返回和当前页面相关的文章 ID，提示助手优先参考。
func ForPage(path string) []string {
	path = strings.TrimRight(strings.TrimSpace(path), "/")
	var ids []string
	for _, article := range articles {
		for _, page := range article.Pages {
			if path == page || (page != "/studio" && strings.HasPrefix(path, page+"/")) {
				ids = append(ids, article.ID)
				break
			}
		}
	}
	return ids
}
