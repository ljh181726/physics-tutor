import './globals.css'; // 這行最重要！負責把所有的排版跟數學公式樣式載入進來

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body className="bg-gray-100">{children}</body>
    </html>
  )
}