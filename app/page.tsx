import { redirect } from "next/navigation";

// A tela inicial é o Painel financeiro com o funil de vendas (D61); o "Hoje" vem logo abaixo no menu.
export default function Home() {
  redirect("/painel");
}
