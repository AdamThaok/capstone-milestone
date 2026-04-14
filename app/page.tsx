import Link from "next/link";

export default function Home() {
  return (
    <main className="container">
      <div className="card">
        <h1>Capstone Milestone</h1>
        <p className="sub">OPM → Code — deployment test</p>
        <Link href="/login"><button className="primary">Login</button></Link>
        <p className="muted"><Link href="/signup">Create an account</Link></p>
      </div>
    </main>
  );
}
