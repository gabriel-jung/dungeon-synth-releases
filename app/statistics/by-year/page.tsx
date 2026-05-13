import { redirect } from "next/navigation"
import { connection } from "next/server"

export default async function StatsByYearIndex() {
  await connection()
  redirect(`/statistics/by-year/${new Date().getUTCFullYear()}`)
}
