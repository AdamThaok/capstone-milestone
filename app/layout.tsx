import "./globals.css";

export const metadata = {
  title: "Capstone — OPM to Code",
  description: "Capstone milestone deployment",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
